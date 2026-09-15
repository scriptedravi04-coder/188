const fs = require('fs');
const file = 'src/components/dashboard/BrandDashboard.jsx';
let code = fs.readFileSync(file, 'utf8');

const fallbackList = `
const brandHeroBannersList = [
  {
    id: "b1",
    title: "Launch UGC Campaigns",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
    link: "/campaigns/create"
  },
  {
    id: "b2",
    title: "Discover Creators",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=600&auto=format&fit=crop",
    link: "/explore"
  }
];
`;

if (!code.includes("const brandHeroBannersList =")) {
    code = code.replace("// Numeric helper", fallbackList + "\n// Numeric helper");
    fs.writeFileSync(file, code);
    console.log("Successfully defined brandHeroBannersList");
} else {
    console.log("brandHeroBannersList already defined");
}
