const axios = require('axios');
async function test() {
   try {
       const res = await axios.post('http://localhost:3000/api/admin/banners', {
           type: 'Influencer',
           placement: 'Dashboard Hero Carousel',
           status: 'Live',
           imgUrl: 'data:image/png;base64,AAAA',
           link: ''
       }, {
           headers: {
               // need auth?
               "Authorization": "Bearer TEST"
           }
       });
       console.log("Response:", res.data);
   } catch (e) {
       console.log("Error:", e.response?.status, e.response?.data);
   }
}
test();
