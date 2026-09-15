const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/banners', {
            headers: { Authorization: "Bearer dev_bypass_2" } // Using creator bypass
        });
        const banners = res.data;
        const heroBanners = banners.filter(b => 
            b.placement === "Dashboard Hero Carousel" && 
            b.status === "Live" && 
            (b.type === "Common" || b.type === "Influencer")
        );
        console.log("Returned banners from API:", banners.length);
        console.log("Filtered hero banners:", heroBanners.length);
    } catch (e) {
        console.error("Error:", e.response?.status, e.response?.data);
    }
}
test();
