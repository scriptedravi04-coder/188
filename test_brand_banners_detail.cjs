const axios = require('axios');
async function test() {
   try {
       const res = await axios.get('http://localhost:3000/api/banners');
       console.log("Banners API Response:", JSON.stringify(res.data, null, 2));
   } catch (e) {
       console.log("Error:", e.response?.status);
   }
}
test();
