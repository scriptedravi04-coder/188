const axios = require('axios');

async function testDelete() {
    try {
        // Send a delete request with dev_bypass
        const res = await axios.delete('http://localhost:3000/api/admin/banners/b2400e60-f91d-469e-a0f2-3afd599471b8', {
            headers: { Authorization: "Bearer dev_bypass_admin" }
        });
        console.log(res.data);
    } catch (e) {
        console.error(e.response?.status, e.response?.data);
    }
}
testDelete();
