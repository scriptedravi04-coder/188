require('dotenv').config();
const axios = require('axios');

async function testDelete() {
    try {
        // Send a delete request with dev_bypass_admin
        const res = await axios.delete('http://localhost:3000/api/admin/banners/13c739e6-6aba-4ec7-966b-e75cd373d9c7', {
            headers: { Authorization: "Bearer dev_bypass_admin" }
        });
        console.log(res.data);
    } catch (e) {
        console.error(e.response?.status, e.response?.data);
    }
}
testDelete();
