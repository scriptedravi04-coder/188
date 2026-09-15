const axios = require('axios');
async function test() {
   try {
       const res = await axios.get('http://localhost:3000/api/banners');
       const banners = res.data;
       const heroBanners = banners.filter(b => 
           b.placement === "Dashboard Hero Carousel" && 
           b.status === "Live" && 
           (b.type === "Common" || b.type === "Influencer")
       );
       console.log("Filtered hero banners:", heroBanners.map(b => b.id));
   } catch (e) {
       console.log("Error:", e.response?.status);
   }
}
test();
