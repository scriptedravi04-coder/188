const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/users', {
            headers: { Authorization: "Bearer dev_bypass_admin" }
        });
        console.log("Success admin users:", res.status);
    } catch (e) {
        console.error("Error admin users:", e.response?.status, e.response?.data);
    }
}
test();
