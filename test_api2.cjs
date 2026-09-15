const axios = require('axios');
async function test() {
   try {
       const res = await axios.post('http://localhost:3000/api/admin/banners', {
           type: 'Brand',
           placement: 'Dashboard Hero Carousel',
           status: 'Live',
           imgUrl: 'data:image/png;base64,AAAA',
           link: ''
       }, {
           headers: {
               // Note: without correct auth it might just return 403.
           }
       });
       console.log("Response:", res.data);
   } catch (e) {
       console.log("Error:", e.response?.status, e.response?.data);
   }
}
test();
