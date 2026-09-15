const axios = require('axios');
async function test() {
   try {
       const res = await axios.delete('http://localhost:3000/api/admin/banners/b2400e60-f91d-469e-a0f2-3afd599471b8');
       console.log("Response:", res.data);
   } catch (e) {
       console.log("Error:", e.response?.status, e.response?.data);
   }
}
test();
