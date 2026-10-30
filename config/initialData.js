// Initial seed data for Krishi Connect marketplace
const CROPS = [
  { key: "tomato", em: "🍅", hi: "टमाटर", en: "Tomato", mr: "टोमॅटो", pa: "ਟਮਾਟਰ", base: 1850, vol: 0.08 },
  { key: "onion",  em: "🧅", hi: "प्याज",  en: "Onion",  mr: "कांदा",  pa: "ਪਿਆਜ਼", base: 2400, vol: 0.07 },
  { key: "potato", em: "🥔", hi: "आलू",    en: "Potato", mr: "बटाटा",  pa: "ਆਲੂ",   base: 1320, vol: 0.05 },
  { key: "wheat",  em: "🌾", hi: "गेहूं",   en: "Wheat",  mr: "गहू",    pa: "ਕਣਕ",   base: 2450, vol: 0.02 },
  { key: "paddy",  em: "🌾", hi: "बासमती धान", en: "Basmati paddy", mr: "बासमती भात", pa: "ਬਾਸਮਤੀ ਝੋਨਾ", base: 3850, vol: 0.03 },
  { key: "soy",    em: "🫘", hi: "सोयाबीन", en: "Soybean", mr: "सोयाबीन", pa: "ਸੋਇਆਬੀਨ", base: 4650, vol: 0.04 },
  { key: "gram",   em: "🫛", hi: "चना",     en: "Gram",    mr: "हरभरा",  pa: "ਛੋਲੇ",  base: 5600, vol: 0.03 },
  { key: "maize",  em: "🌽", hi: "मक्का",   en: "Maize",   mr: "मका",    pa: "ਮੱਕੀ",  base: 2150, vol: 0.04 }
];

const TRANSPORTERS = [
  { id: "T1", name: "Rakesh Yadav", veh: "UP 41 GT 4402", type: "Truck 9T", base: "Barabanki", rate: 38 },
  { id: "T2", name: "Sandeep Patil", veh: "MH 15 CQ 8891", type: "Truck 16T", base: "Nashik", rate: 34 },
  { id: "T3", name: "Gurpreet Singh", veh: "PB 10 EK 2210", type: "Trailer 21T", base: "Khanna", rate: 30 },
  { id: "T4", name: "Imran Khan", veh: "MP 09 HD 5567", type: "Reefer 7T", base: "Indore", rate: 52 },
  { id: "T5", name: "Mahesh Gowda", veh: "KA 25 B 9043", type: "Truck 9T", base: "Hubli", rate: 36 }
];

const INITIAL_EQUIPMENT = [
  { id: "E1", name: "ट्रैक्टर 35HP|Tractor (35 HP)", em: "🚜", owner: "रामकिशन यादव", location: "Barabanki, Uttar Pradesh", rate: 450, unit: "hr", mine: true, available: true },
  { id: "E2", name: "कंबाइन हार्वेस्टर|Combine harvester", em: "🌾", owner: "संतोष पाटील", location: "Nashik, Maharashtra", rate: 1800, unit: "hr", mine: false, available: true },
  { id: "E3", name: "रोटावेटर|Rotavator", em: "🔄", owner: "जसविंदर सिंह", location: "Khanna, Punjab", rate: 300, unit: "hr", mine: false, available: true },
  { id: "E4", name: "स्प्रे ड्रोन|Crop-spray drone", em: "🛸", owner: "कमलेश वर्मा", location: "Indore, Madhya Pradesh", rate: 600, unit: "acre", mine: false, available: true },
  { id: "E5", name: "सीड ड्रिल|Seed drill", em: "🌱", owner: "भँवर लाल जाट", location: "Kota, Rajasthan", rate: 250, unit: "hr", mine: false, available: false },
  { id: "E6", name: "थ्रेशर|Thresher", em: "⚙️", owner: "हरप्रीत कौर", location: "Patiala, Punjab", rate: 1200, unit: "day", mine: false, available: true }
];

const INITIAL_LISTINGS = [
  { id: "L1", cropKey: "tomato", qty: 42, price: 1780, grade: "A", state: "Uttar Pradesh", district: "Barabanki", farmer: "रामकिशन यादव", photo: null, status: "active", mine: true, created: Date.now() - 3600000 },
  { id: "L2", cropKey: "onion", qty: 120, price: 2280, grade: "B", state: "Maharashtra", district: "Nashik", farmer: "संतोष पाटील", photo: null, status: "active", mine: false, created: Date.now() - 7200000 },
  { id: "L3", cropKey: "wheat", qty: 260, price: 2510, grade: "A", state: "Punjab", district: "Khanna", farmer: "जसविंदर सिंह", photo: null, status: "active", mine: false, created: Date.now() - 10800000 },
  { id: "L4", cropKey: "soy", qty: 85, price: 4520, grade: "B", state: "Madhya Pradesh", district: "Indore", farmer: "कमलेश वर्मा", photo: null, status: "active", mine: false, created: Date.now() - 2600000 },
  { id: "L5", cropKey: "potato", qty: 300, price: 1240, grade: "C", state: "Uttar Pradesh", district: "Sitapur", farmer: "मुन्ना लाल", photo: null, status: "active", mine: true, created: Date.now() - 15000000 },
  { id: "L6", cropKey: "gram", qty: 64, price: 5480, grade: "A", state: "Rajasthan", district: "Kota", farmer: "भँवर लाल जाट", photo: null, status: "active", mine: false, created: Date.now() - 5200000 },
  { id: "L7", cropKey: "paddy", qty: 180, price: 3920, grade: "A", state: "Punjab", district: "Patiala", farmer: "हरप्रीत कौर", photo: null, status: "active", mine: false, created: Date.now() - 1400000 },
  { id: "L8", cropKey: "maize", qty: 210, price: 2090, grade: "B", state: "Karnataka", district: "Hubli", farmer: "बसवराज हिरेमठ", photo: null, status: "active", mine: false, created: Date.now() - 9000000 }
];

const INITIAL_BIDS = [
  { id: "B1", listingId: "L1", buyer: "Agro Fresh Retail Pvt Ltd", rate: 1820, qty: 42, note: "आज शाम तक गाड़ी भेज देंगे", status: "pending", created: Date.now() - 360000 },
  { id: "B2", listingId: "L1", buyer: "Shri Balaji Traders", rate: 1795, qty: 30, note: "", status: "pending", created: Date.now() - 900000 },
  { id: "B3", listingId: "L5", buyer: "ITC Agri Business", rate: 1265, qty: 300, note: "Full load chahiye", status: "pending", created: Date.now() - 1800000 }
];

const INITIAL_DEALS = [];
const INITIAL_CONTRACTS = [];

const INITIAL_WALLET = {
  balance: 128400,
  txns: [
    { id: "W1", kind: "in", label: "आलू — 120 क्विंटल", amt: 148800, when: Date.now() - 86400000 * 6 },
    { id: "W2", kind: "out", label: "बैंक ट्रांसफर PNB ••••4471", amt: -120000, when: Date.now() - 86400000 * 5 },
    { id: "W3", kind: "in", label: "गेहूं — 40 क्विंटल", amt: 99600, when: Date.now() - 86400000 * 21 }
  ]
};

const INITIAL_PRICES = CROPS.reduce((acc, c) => {
  const hist = [];
  let p = c.base * (1 - c.vol * 0.6);
  for (let i = 0; i < 14; i++) {
    p = p * (1 + (Math.sin(i / 2.2) * c.vol * 0.5) + (Math.random() - 0.45) * c.vol * 0.35);
    hist.push(Math.round(p));
  }
  const forecast = Math.round((Math.random() - 0.35) * c.base * c.vol * 1.9);
  acc[c.key] = { now: hist[hist.length - 1], hist, forecast };
  return acc;
}, {});

const INITIAL_USERS = [
  {
    contact: "9876543221",
    passwordHash: "$2a$10$wWk1jV2.N3QvK0q8L8Fhfeq2zUqQO6W7K4Wf4u0qf7I4T.Zg7Jb4e", // password: "password123"
    role: "farmer",
    name: "किसान साथी",
    village: "Barabanki, Uttar Pradesh",
    phone: "98765 43221",
    bank: "PNB ••••4471"
  },
  {
    contact: "9810000123",
    passwordHash: "$2a$10$wWk1jV2.N3QvK0q8L8Fhfeq2zUqQO6W7K4Wf4u0qf7I4T.Zg7Jb4e", // password: "password123"
    role: "buyer",
    name: "Agro Fresh Retail Partner",
    village: "Delhi NCR",
    phone: "98100 00123",
    bank: "HDFC ••••8819"
  },
  {
    contact: "admin",
    passwordHash: "$2a$10$wWk1jV2.N3QvK0q8L8Fhfeq2zUqQO6W7K4Wf4u0qf7I4T.Zg7Jb4e", // password: "password123"
    role: "admin",
    name: "कंट्रोल रूम एडमिन",
    village: "Central Mandi HQ",
    phone: "99999 00000",
    bank: "SBI ••••0001"
  }
];

const INITIAL_RETURNS = [];

module.exports = {
  CROPS,
  TRANSPORTERS,
  INITIAL_EQUIPMENT,
  INITIAL_LISTINGS,
  INITIAL_BIDS,
  INITIAL_DEALS,
  INITIAL_CONTRACTS,
  INITIAL_RETURNS,
  INITIAL_WALLET,
  INITIAL_PRICES,
  INITIAL_USERS
};
