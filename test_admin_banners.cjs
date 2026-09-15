const axios = require('axios');
async function test() {
   try {
       const res = await axios.get('http://localhost:3000/api/admin/banners');
       console.log("Banners GET:", res.status);
   } catch(e) {
       console.log("Banners Error:", e.message);
   }
}
test();
