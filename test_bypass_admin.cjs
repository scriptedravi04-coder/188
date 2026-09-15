const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/auth/me', {
            headers: { Authorization: "Bearer dev_bypass_admin" }
        });
        console.log("Success:", res.data.user_id, res.data.role);
    } catch (e) {
        console.error("Error:", e.response?.status, e.response?.data);
    }
}
test();
