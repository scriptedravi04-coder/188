import React, { useState } from 'react';
import { api } from '../../../lib/api';
import { toast } from 'sonner';

export default function MobileBrandOnboarding({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    companyName: '', industry: '', description: '',
    representativeName: user?.name || '', representativeMobile: '',
    websiteUrl: '',
    instagramHandle: '', linkedinHandle: '', youtubeHandle: ''
  });

  const updateData = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  const handleNext = async (currentStep) => {
    if (currentStep === 1) {
      if (!data.companyName) return toast.error("Brand name is required");
    } else if (currentStep === 2) {
      if (!data.representativeName) return toast.error("Representative name is required");
    }
    
    if (currentStep < 3) {
      setStep(currentStep + 1);
      return;
    }

    setLoading(true);
    try {
      await api.post("auth/onboard", { role: "brand", data });
      setStep(4);
    } catch (err) {
      toast.error("Failed to save onboarding data");
    }
    setLoading(false);
  };

  const handleSkip = (currentStep) => {
    if (currentStep < 3) setStep(currentStep + 1);
    else handleNext(currentStep); // on step 3 skip goes to 4
  };

  const renderProgressBar = (currentStep) => {
    return (
      <div className="flex gap-[5px]">
        {[1,2,3,4].map(i => (
          <div key={i} className={`flex-1 h-1 rounded-sm ${i <= currentStep ? 'bg-[var(--violet)]' : 'bg-[#EDEDF2]'}`} />
        ))}
      </div>
    );
  };

  const Header = ({ currentStep, title, subtitle, stepName }) => (
    <div className="pt-3 px-5">
      <div className="h-9 flex items-center justify-between">
        <div className="w-8 h-8 rounded-xl border border-[#E5E5E2] flex items-center justify-center cursor-pointer active:scale-95 transition-transform" onClick={() => setStep(Math.max(1, currentStep - 1))}>
          <svg width="8" height="14" viewBox="0 0 9 16" fill="none"><path d="M7.5 1L1.5 8l6 7" stroke="#0B0B0F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></svg>
        </div>
        <div className="flex items-center gap-[6px] h-7 px-2.5 rounded-lg bg-[#F3EBFF]">
          <svg width="12" height="12" viewBox="0 0 22 22" fill="none"><rect x="3" y="6.5" width="16" height="12.5" rx="2.5" stroke="#7C3AED" strokeWidth="2"></rect><path d="M8 6.5V4.8A1.8 1.8 0 019.8 3h2.4A1.8 1.8 0 0114 4.8v1.7" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"></path></svg>
          <span className="font-bold text-[11px] text-[var(--violet)]">Brand</span>
        </div>
      </div>
      <div className="h-2"></div>
      {renderProgressBar(currentStep)}
      <div className="h-1.5"></div>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-[11px] text-[#8A8A94]">Step {currentStep} of 4 &middot; {stepName}</span>
        {currentStep > 1 && currentStep < 4 && <span className="font-bold text-[11px] text-[var(--violet)] cursor-pointer" onClick={() => handleSkip(currentStep)}>Skip</span>}
      </div>
      <div className="h-2.5"></div>
      <div className="font-extrabold text-[22px] sm:text-[24px] leading-[1.2] text-[#0B0B0F] tracking-tight">{title}</div>
      <div className="h-1"></div>
      <div className="font-medium text-[13px] leading-[1.4] text-[#6B6B76]">{subtitle}</div>
    </div>
  );

  if (step === 1) {
    return (
      <div className="min-h-screen bg-white box-border flex flex-col justify-between relative font-sans">
        <div>
          <Header currentStep={1} stepName="Brand profile" title="Tell us about your brand" subtitle="Creators see this on every brief you post." />
          <div className="px-5 pt-3 pb-24">
            <div className="flex items-center gap-3.5">
              <div className="w-[68px] h-[68px] rounded-[20px] bg-[#F9F9FB] border-[1.5px] border-dashed border-[#D8D8DE] flex flex-col items-center justify-center gap-1 shrink-0 relative pb-1.5 box-border cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><rect x="3" y="4.4" width="16" height="13.2" rx="3" stroke="#8A8A94" strokeWidth="1.6"></rect><path d="M3.6 14.4l4.2-4 3.6 3.4 2.6-2.4 4.4 4" stroke="#8A8A94" strokeWidth="1.6" strokeLinejoin="round"></path></svg>
                <span className="font-semibold text-[10px] text-[#8A8A94]">Logo</span>
                <div className="absolute right-[-2px] bottom-[-6px] w-[24px] h-[24px] rounded-full bg-[var(--violet)] border-2 border-white flex items-center justify-center">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3.4v9.2M3.4 8h9.2" stroke="#fff" strokeWidth="2" strokeLinecap="round"></path></svg>
                </div>
              </div>
              <div className="font-medium text-[12.5px] leading-[1.45] text-[#8A8A94]">
                Square PNG or JPG, min 400x400.<br/>Shown at 12px radius.
              </div>
            </div>
            <div className="h-3"></div>
            <div className="flex flex-col gap-2.5">
              <div className="h-12 rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] px-3.5 flex flex-col justify-center gap-[2px] focus-within:bg-white focus-within:border-[1.5px] focus-within:border-[var(--violet)]">
                <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA] focus-within:text-[var(--violet)]">Brand name</div>
                <input value={data.companyName} onChange={(e) => updateData('companyName', e.target.value)} className="font-medium text-[14px] leading-[1.2] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full placeholder:text-[#C6C6CE]" placeholder="Enter brand name" />
              </div>
              <div className="h-12 rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] px-3.5 flex items-center justify-between">
                <div className="flex flex-col justify-center gap-[2px] flex-1">
                  <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA]">Industry</div>
                  <input value={data.industry} readOnly onClick={() => updateData('industry', 'Beauty & Personal Care')} className="font-medium text-[14px] leading-[1.2] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full cursor-pointer placeholder:text-[#C6C6CE]" placeholder="Select industry" />
                </div>
                <svg width="10" height="6" viewBox="0 0 12 7" fill="none" className="shrink-0"><path d="M1 1l5 5 5-5" stroke="#8A8A94" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </div>
              <div className="rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] pt-2.5 px-3.5 pb-2 focus-within:bg-white focus-within:border-[1.5px] focus-within:border-[var(--violet)]">
                <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA]">Brand description</div>
                <div className="h-1"></div>
                <textarea value={data.description} onChange={(e) => updateData('description', e.target.value.slice(0, 200))} className="font-medium text-[13.5px] leading-[1.4] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full resize-none h-[40px]" placeholder="What does your brand do?" />
                <div className="flex justify-end"><span className="font-semibold text-[10px] text-[#C6C6CE]">{data.description.length} / 200</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="fixed sm:static bottom-0 left-0 right-0 border-t border-[#F0F0F3] pt-3 px-5 pb-5 sm:pb-6 bg-white z-20">
          <button onClick={() => handleNext(1)} className="w-full h-[48px] rounded-xl bg-[var(--violet)] flex items-center justify-center font-bold text-[15px] text-white active:scale-95 transition-transform cursor-pointer shadow-sm">
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-white box-border flex flex-col justify-between relative font-sans">
        <div>
          <Header currentStep={2} stepName="Representative" title="Who's managing this account?" subtitle="Creators talk to a person, not a logo." />
          <div className="px-5 pt-3.5 pb-24">
            <div className="flex flex-col gap-2.5">
              <div className="h-12 rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] px-3.5 flex flex-col justify-center gap-[2px] focus-within:bg-white focus-within:border-[1.5px] focus-within:border-[var(--violet)]">
                <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA] focus-within:text-[var(--violet)]">Representative name</div>
                <input value={data.representativeName} onChange={(e) => updateData('representativeName', e.target.value)} className="font-medium text-[14px] leading-[1.2] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full placeholder:text-[#C6C6CE]" placeholder="Full name" />
              </div>
              <div className="h-12 rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] px-3.5 flex items-center gap-2.5">
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA]">Official phone number</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1 pr-2 border-r border-[#E5E5E2] cursor-pointer">
                      <span className="font-semibold text-[14px] leading-[1.2] text-[#0B0B0F]">+91</span>
                      <svg width="8" height="5" viewBox="0 0 12 7" fill="none"><path d="M1 1l5 5 5-5" stroke="#8A8A94" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                    </div>
                    <input value={data.representativeMobile} onChange={(e) => updateData('representativeMobile', e.target.value)} className="font-medium text-[14px] leading-[1.2] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full placeholder:text-[#C6C6CE]" placeholder="98765 43210" />
                  </div>
                </div>
              </div>
            </div>
            <div className="h-3"></div>
            <div className="rounded-xl bg-[#F9F9FB] p-3 flex gap-2.5 items-start">
              <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#8A8A94" strokeWidth="1.6"></circle><path d="M9 5.6v.1M9 8.2v4.2" stroke="#8A8A94" strokeWidth="1.8" strokeLinecap="round"></path></svg>
              <div className="font-medium text-[12px] leading-[1.5] text-[#6B6B76]">Used only for campaign coordination. Never shown publicly on your briefs.</div>
            </div>
          </div>
        </div>
        <div className="fixed sm:static bottom-0 left-0 right-0 border-t border-[#F0F0F3] pt-3 px-5 pb-5 sm:pb-6 bg-white z-20">
          <button onClick={() => handleNext(2)} className="w-full h-[48px] rounded-xl bg-[var(--violet)] flex items-center justify-center font-bold text-[15px] text-white active:scale-95 transition-transform cursor-pointer shadow-sm">
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="min-h-screen bg-white box-border flex flex-col justify-between relative font-sans">
        <div>
          <Header currentStep={3} stepName="Presence" title="Where can creators find you?" subtitle="A live website and socials raise application rates." />
          <div className="px-5 pt-3 pb-24">
            <div className="h-12 rounded-xl bg-[#F9F9FB] border border-[#EDEDF2] px-3.5 flex items-center gap-2.5 focus-within:bg-white focus-within:border-[1.5px] focus-within:border-[var(--violet)]">
              <div className="flex-1 flex flex-col justify-center min-w-0">
                <div className="font-semibold text-[10.5px] leading-none text-[#A0A0AA] focus-within:text-[var(--violet)]">Website</div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-medium text-[14px] leading-[1.2] text-[#A0A0AA]">https://</span>
                  <input value={data.websiteUrl} onChange={(e) => updateData('websiteUrl', e.target.value)} className="font-medium text-[14px] leading-[1.2] text-[#0B0B0F] bg-transparent outline-none p-0 m-0 w-full placeholder:text-[#C6C6CE]" placeholder="yourbrand.com" />
                </div>
              </div>
            </div>

            <div className="h-3.5"></div>
            <div className="font-bold text-[10.5px] leading-none tracking-[1px] uppercase text-[#A0A0AA]">Social channels</div>
            <div className="h-2"></div>
            
            <div className="rounded-2xl bg-white border border-[#E5E5E2] overflow-hidden">
              <div className="h-12 px-3.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#F9F9FB] flex items-center justify-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><rect x="2.4" y="2.4" width="13.2" height="13.2" rx="4" stroke="#6B6B76" strokeWidth="1.6"></rect><circle cx="9" cy="9" r="3.2" stroke="#6B6B76" strokeWidth="1.6"></circle></svg>
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="font-semibold text-[13.5px] leading-none text-[#0B0B0F]">Instagram</div>
                  {data.instagramHandle && <div className="font-medium text-[11px] text-[#8A8A94] mt-0.5 truncate">{data.instagramHandle}</div>}
                </div>
                {data.instagramHandle ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#0E9F6E"></circle><path d="M4.6 8.2l2.3 2.3L11.4 6" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                ) : (
                  <div className="h-7 px-3 rounded-lg bg-[var(--violet)] flex items-center justify-center font-bold text-xs text-white cursor-pointer" onClick={() => updateData('instagramHandle', '@brand_insta')}>Link</div>
                )}
              </div>
              
              <div className="h-px bg-[#F0F0F3] ml-12"></div>
              
              <div className="h-12 px-3.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#F9F9FB] flex items-center justify-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><rect x="2.4" y="2.4" width="13.2" height="13.2" rx="3" stroke="#6B6B76" strokeWidth="1.6"></rect><path d="M5.6 7.4v5M5.6 5.4v.1M8.6 12.4v-5M8.6 9.2c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v3.2" stroke="#6B6B76" strokeWidth="1.6" strokeLinecap="round"></path></svg>
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="font-semibold text-[13.5px] leading-none text-[#0B0B0F]">LinkedIn</div>
                  {data.linkedinHandle && <div className="font-medium text-[11px] text-[#8A8A94] mt-0.5 truncate">{data.linkedinHandle}</div>}
                </div>
                {data.linkedinHandle ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#0E9F6E"></circle><path d="M4.6 8.2l2.3 2.3L11.4 6" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                ) : (
                  <div className="h-7 px-3 rounded-lg bg-[var(--violet)] flex items-center justify-center font-bold text-xs text-white cursor-pointer" onClick={() => updateData('linkedinHandle', '@brand_linkedin')}>Link</div>
                )}
              </div>

              <div className="h-px bg-[#F0F0F3] ml-12"></div>
              
              <div className="h-12 px-3.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#F9F9FB] flex items-center justify-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><rect x="1.8" y="4" width="14.4" height="10" rx="3" stroke="#6B6B76" strokeWidth="1.6"></rect><path d="M7.6 6.8l3.6 2.2-3.6 2.2V6.8z" fill="#6B6B76"></path></svg>
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="font-semibold text-[13.5px] leading-none text-[#0B0B0F]">YouTube</div>
                  {data.youtubeHandle && <div className="font-medium text-[11px] text-[#8A8A94] mt-0.5 truncate">{data.youtubeHandle}</div>}
                </div>
                {data.youtubeHandle ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#0E9F6E"></circle><path d="M4.6 8.2l2.3 2.3L11.4 6" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                ) : (
                  <div className="h-7 px-3 rounded-lg bg-white border border-[#E5E5E2] flex items-center justify-center font-bold text-xs text-[var(--violet)] cursor-pointer" onClick={() => updateData('youtubeHandle', '@brand_youtube')}>Link</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="fixed sm:static bottom-0 left-0 right-0 border-t border-[#F0F0F3] pt-3 px-5 pb-5 sm:pb-6 bg-white z-20">
          <button onClick={() => handleNext(3)} className="w-full h-[48px] rounded-xl bg-[var(--violet)] flex items-center justify-center font-bold text-[15px] text-white active:scale-95 transition-transform cursor-pointer shadow-sm">
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    const initials = data.companyName ? data.companyName.substring(0, 2).toUpperCase() : "BR";
    
    return (
      <div className="min-h-screen bg-white box-border flex flex-col justify-between pt-4 px-5 pb-6 relative overflow-hidden font-sans">
        <div className="absolute left-[-60px] top-[80px] w-[240px] h-[240px] rounded-full bg-[#F6F1FF] pointer-events-none"></div>
        <div className="absolute right-[-70px] top-[240px] w-[200px] h-[200px] rounded-full bg-[#FAF7FF] pointer-events-none"></div>
        
        <div>
          <div className="flex gap-[5px] relative">
            <div className="flex-1 h-1 rounded-sm bg-[var(--violet)]"></div>
            <div className="flex-1 h-1 rounded-sm bg-[var(--violet)]"></div>
            <div className="flex-1 h-1 rounded-sm bg-[var(--violet)]"></div>
            <div className="flex-1 h-1 rounded-sm bg-[var(--violet)]"></div>
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center py-6 relative">
          <div className="w-[84px] h-[84px] rounded-[24px] bg-white border border-[#E5E5E2] flex items-center justify-center font-extrabold text-[26px] text-[var(--violet)] shadow-[0_10px_25px_rgba(11,11,15,0.06)]">
            {initials}
          </div>
          
          <div className="h-3"></div>
          <div className="h-7 px-3 rounded-lg bg-[#E9F7F1] flex items-center gap-1.5">
            <svg width="11" height="8" viewBox="0 0 12 9" fill="none"><path d="M1 4.6L4.2 7.8 11 1" stroke="#0E9F6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
            <span className="font-bold text-[11px] text-[#0E9F6E]">Brand profile live</span>
          </div>

          <div className="h-3.5"></div>
          <div className="font-extrabold text-[24px] leading-[1.2] text-[#0B0B0F] tracking-tight text-center">Welcome, {data.companyName || "Brand"}</div>
          <div className="h-1.5"></div>
          <div className="font-medium text-[13.5px] leading-[1.5] text-[#6B6B76] text-center max-w-[280px]">
            Post your first campaign or browse creators in {data.industry || 'your industry'}.
          </div>
          
          <div className="h-4"></div>
          
          <div className="w-full rounded-2xl bg-[#F9F9FB] border border-[#EDEDF2] p-3.5 flex items-center">
            <div className="flex-1 text-center">
              <div className="font-extrabold text-[17px] leading-none text-[#0B0B0F]">2,400+</div>
              <div className="font-semibold text-[10.5px] text-[#8A8A94] mt-1">Creators in niche</div>
            </div>
            <div className="w-px h-7 bg-[#E5E5E2]"></div>
            <div className="flex-1 text-center">
              <div className="font-extrabold text-[17px] leading-none text-[#0B0B0F]">24h</div>
              <div className="font-semibold text-[10.5px] text-[#8A8A94] mt-1">Avg. first apply</div>
            </div>
          </div>
        </div>
        
        <div className="relative">
          <button onClick={onComplete} className="w-full h-[50px] rounded-xl bg-[var(--violet)] flex items-center justify-center font-bold text-[15.5px] text-white active:scale-95 transition-transform shadow-[0_4px_15px_rgba(124,58,237,0.2)] cursor-pointer">
            Go to Brand Dashboard
          </button>
          <div className="h-2.5"></div>
          <div className="text-center font-semibold text-[12.5px] text-[#8A8A94]">
            Post your first campaign
          </div>
        </div>
      </div>
    );
  }

  return null;
}
