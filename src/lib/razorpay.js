import { api } from "./api";
import { toast } from "sonner";

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn("Failed to load Razorpay SDK dynamically");
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export async function processRazorpayPayment({
  dealId,
  threadId,
  campaignId,
  briefId,
  creatorId,
  grossAmount,
  onSuccess,
  onError
}) {
  try {
    if (typeof window.Razorpay === "undefined") {
      const loaded = await loadRazorpayScript();
      if (!loaded || typeof window.Razorpay === "undefined") {
        toast.error("Razorpay SDK is currently unavailable. Please check your network and try again.");
        return;
      }
    }

    // 1. Create order on backend
    const { data: orderData } = await api.post("payments/razorpay/create-order", {
      deal_id: dealId || null,
      thread_id: threadId || null,
      campaign_id: campaignId || null,
      brief_id: briefId || null,
      creator_id: creatorId || null,
      gross_amount: Number(grossAmount)
    });

    if (!orderData?.order_id || !orderData?.key_id) {
      throw new Error(orderData?.error || "Failed to create Razorpay payment order");
    }

    const isTestMode = Boolean(
      orderData.is_test_mode ||
      orderData.key_id?.startsWith("rzp_test_") ||
      window.location.hostname === "localhost" ||
      window.location.hostname.includes("run.app")
    );

    let isCompleted = false;
    let hasTriggeredSuccess = false;
    let pollInterval = null;
    let testToastId = null;

    const triggerSuccessOnce = (data) => {
      if (hasTriggeredSuccess) return;
      hasTriggeredSuccess = true;
      isCompleted = true;
      if (testToastId) {
        toast.dismiss(testToastId);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (onSuccess) onSuccess(data);
    };

    // Helper to simulate instant completion in test mode
    const simulateTestComplete = async () => {
      try {
        toast.loading("Simulating Test Escrow Deposit...", { id: "test-complete-toast" });
        const { data: testData } = await api.post("payments/razorpay/test-complete", {
          deal_id: dealId || null,
          thread_id: threadId || null,
          campaign_id: campaignId || null,
          brief_id: briefId || null,
          creator_id: creatorId || null,
          order_id: orderData.order_id,
          transaction_id: orderData.transaction_id,
          gross_amount: Number(grossAmount)
        });
        toast.dismiss("test-complete-toast");
        if (testData?.verified || testData?.success) {
          if (testData?.state_sync_failed) {
            toast.error("Test payment recorded, but the deal status failed to update. This points to a real backend sync bug — check server logs for: " + (testData.state_sync_error || "unknown error"), { duration: 12000 });
          } else {
            toast.success("Test Payment Verified! Escrow funds held successfully.");
          }
          triggerSuccessOnce(testData);
        } else {
          toast.error("Test payment simulation failed");
        }
      } catch (err) {
        toast.dismiss("test-complete-toast");
        toast.error(err?.response?.data?.error || err.message || "Failed to simulate test payment");
      }
    };

    // Auto-polling helper to check if UPI QR payment was captured on phone
    const startPolling = () => {
      let attempts = 0;
      pollInterval = setInterval(async () => {
        attempts++;
        if (isCompleted || hasTriggeredSuccess || attempts > 30) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
        try {
          const { data: statusData } = await api.post("payments/razorpay/check-status", {
            deal_id: dealId || null,
            thread_id: threadId || null,
            order_id: orderData.order_id
          });
          if (statusData?.paid && !hasTriggeredSuccess) {
            toast.success("Payment detected and confirmed in Escrow!");
            triggerSuccessOnce(statusData);
          }
        } catch (e) {
          // ignore transient poll error
        }
      }, 3000);
    };

    startPolling();

    // 2. Configure and launch Razorpay Checkout modal
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency || "INR",
      name: "Ybex Escrow Platform",
      description: "Secure Escrow Payment Deposit",
      order_id: orderData.order_id,
      prefill: {
        name: orderData.user_name || "Brand Partner",
        email: orderData.user_email || "brand@example.com",
        contact: orderData.user_phone || "9876543210"
      },
      retry: {
        enabled: true
      },
      handler: async function (response) {
        if (hasTriggeredSuccess) return;
        try {
          isCompleted = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          toast.info("Verifying payment signature with Escrow...");
          // 3. Verify signature on backend
          const { data: verifyData } = await api.post("payments/razorpay/verify", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            deal_id: dealId || null,
            thread_id: threadId || null,
            campaign_id: campaignId || null,
            brief_id: briefId || null,
            transaction_id: orderData.transaction_id
          });

          if (verifyData?.verified) {
            if (verifyData?.state_sync_failed) {
              // The Razorpay payment itself genuinely succeeded, but the
              // backend couldn't persist the deal/thread as ACTIVE (e.g. a
              // database sync issue). Don't tell the user everything is
              // fine — their money was taken, but the app state may not
              // reflect it correctly yet. Ask them to refresh and contact
              // support if it doesn't resolve, instead of silently moving
              // on as if nothing went wrong.
              toast.error("Payment was received, but we hit an issue updating your deal status. Please refresh in a moment — if 'Payment pending' doesn't clear, contact support with payment ID " + (verifyData.payment_id || response.razorpay_payment_id) + " so we don't charge you again.", { duration: 12000 });
              console.error("[Razorpay] Payment verified but state sync failed:", verifyData.state_sync_error);
            } else {
              toast.success("Payment verified! Funds are held safely in Escrow.");
            }
            triggerSuccessOnce(verifyData);
          } else {
            toast.error("Razorpay signature verification failed.");
            if (onError) onError(new Error("Verification failed"));
          }
        } catch (err) {
          const errMsg = err?.response?.data?.error || err.message || "Payment verification failed.";
          toast.error(errMsg);
          if (onError) onError(err);
        }
      },
      modal: {
        ondismiss: async function () {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (hasTriggeredSuccess) return;

          // Check one last time in case user paid on UPI app and closed popup
          try {
            const { data: statusData } = await api.post("payments/razorpay/check-status", {
              deal_id: dealId || null,
              thread_id: threadId || null,
              order_id: orderData.order_id
            });
            if (statusData?.paid && !hasTriggeredSuccess) {
              toast.success("Payment confirmed in Escrow!");
              triggerSuccessOnce(statusData);
              return;
            }
          } catch (e) {}

          if (!hasTriggeredSuccess && !isCompleted) {
            if (isTestMode) {
              toast.info("Testing Mode: Complete test payment?", {
                action: {
                  label: "⚡ Complete Test Pay",
                  onClick: () => simulateTestComplete()
                },
                duration: 10000
              });
            } else {
              toast.info("Payment window closed");
            }
            if (onError) onError(new Error("Payment window closed"));
          }
        }
      },
      theme: {
        color: "#6366f1"
      }
    };

    const rzp1 = new window.Razorpay(options);
    rzp1.on("payment.failed", function (resp) {
      toast.error(resp.error?.description || "Payment failed");
      if (isTestMode) {
        toast.info("Testing on Desktop? Click to simulate successful test deposit:", {
          action: {
            label: "⚡ Simulate Test Pay",
            onClick: () => simulateTestComplete()
          },
          duration: 10000
        });
      }
      if (onError) onError(resp.error);
    });

    rzp1.open();

    if (isTestMode) {
      testToastId = toast.info("🧪 Test Mode Active: Pay in Razorpay popup or click below to simulate:", {
        action: {
          label: "⚡ Auto-Complete",
          onClick: () => simulateTestComplete()
        },
        duration: 15000
      });
    }

  } catch (err) {
    const errMsg = err?.response?.data?.error || err.message || "Failed to initiate Razorpay payment";
    toast.error(errMsg);
    if (onError) onError(err);
  }
}
