const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/auth/me', {
            headers: { Authorization: "Bearer dev_bypass_admin" }
        });
        console.log("Success:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("Error:", e.response?.status, e.response?.data);
    }
}
test();
