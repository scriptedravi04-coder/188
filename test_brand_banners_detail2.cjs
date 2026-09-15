const axios = require('axios');
async function test() {
   try {
       const res = await axios.get('http://localhost:3000/api/banners');
       const banners = res.data;
       console.log("Banners statuses:", banners.map(b => ({id: b.id, status: b.status, type: b.type, placement: b.placement})));
   } catch (e) {
       console.log("Error:", e.response?.status);
   }
}
test();
