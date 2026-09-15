const axios = require('axios');
async function test() {
   try {
       const res = await axios.get('http://localhost:3000/api/banners', {
            headers: { Authorization: "Bearer dev_bypass_2" } 
       });
       const banners = res.data;
       console.log("Raw from API:", banners.map(b => ({id: b.id, imgUrl: b.imgUrl, image_url: b.image_url, image: b.image})));
   } catch (e) {
       console.log("Error:", e.response?.status);
   }
}
test();
