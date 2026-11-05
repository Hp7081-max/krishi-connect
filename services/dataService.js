const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDBStatus } = require('../config/db');
const initialData = require('../config/initialData');

// Mongoose Models
const User = require('../models/User');
const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Deal = require('../models/Deal');
const Equipment = require('../models/Equipment');
const ReturnRequest = require('../models/ReturnRequest');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let inMemoryStore = null;
let ioInstance = null;

function setSocketIO(io) {
  ioInstance = io;
}

function emitEvent(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      users: initialData.INITIAL_USERS,
      listings: initialData.INITIAL_LISTINGS,
      bids: initialData.INITIAL_BIDS,
      deals: initialData.INITIAL_DEALS,
      contracts: initialData.INITIAL_CONTRACTS,
      returns: initialData.INITIAL_RETURNS || [],
      equipment: initialData.INITIAL_EQUIPMENT,
      wallet: initialData.INITIAL_WALLET,
      prices: initialData.INITIAL_PRICES,
      scans: [],
      soilAdvice: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    inMemoryStore = defaultData;
  } else {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      inMemoryStore = JSON.parse(content);
      if (!inMemoryStore.returns) inMemoryStore.returns = [];
    } catch (e) {
      console.error('Error reading db.json, restoring defaults', e);
      inMemoryStore = {
        users: initialData.INITIAL_USERS,
        listings: initialData.INITIAL_LISTINGS,
        bids: initialData.INITIAL_BIDS,
        deals: initialData.INITIAL_DEALS,
        contracts: initialData.INITIAL_CONTRACTS,
        returns: initialData.INITIAL_RETURNS || [],
        equipment: initialData.INITIAL_EQUIPMENT,
        wallet: initialData.INITIAL_WALLET,
        prices: initialData.INITIAL_PRICES,
        scans: [],
        soilAdvice: []
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(inMemoryStore, null, 2), 'utf8');
    }
  }
}

function saveStore() {
  if (inMemoryStore) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(inMemoryStore, null, 2), 'utf8');
    } catch (e) {
      console.error('Error persisting db.json', e);
    }
  }
}

// Generate simple unique IDs
function uid(prefix = 'ID') {
  return prefix + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper: Make Contract
function makeContract(deal, listing) {
  const l = listing || {};
  return {
    id: `C-${deal.id}`,
    dealId: deal.id,
    created: deal.created || Date.now(),
    seller: {
      name: deal.farmer,
      phone: deal.sellerPhone || '98765 43221',
      place: `${l.district || 'Barabanki'}, ${l.state || 'Uttar Pradesh'}`
    },
    buyer: {
      name: deal.buyer,
      phone: deal.buyerPhone || '98100 00123'
    },
    cropKey: l.cropKey || 'crop',
    grade: l.grade || 'A',
    qty: deal.qty,
    rate: deal.rate,
    amount: deal.amount,
    commission: deal.commission
  };
}

// Seeder for MongoDB if it's connected and empty
async function seedMongoDBIfNeeded() {
  const status = getDBStatus();
  if (!status.isConnected) return;

  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Seeding initial records into MongoDB...');
      for (const u of initialData.INITIAL_USERS) {
        await User.create({
          contact: u.contact,
          password: u.passwordHash,
          role: u.role,
          name: u.name,
          village: u.village,
          phone: u.phone,
          bank: u.bank
        });
      }
      for (const l of initialData.INITIAL_LISTINGS) {
        await Listing.create(l);
      }
      for (const b of initialData.INITIAL_BIDS) {
        await Bid.create(b);
      }
      for (const eq of initialData.INITIAL_EQUIPMENT) {
        await Equipment.create(eq);
      }
      console.log('✅ MongoDB seeded with initial marketplace lots, bids and equipment!');
    }
  } catch (err) {
    console.warn('⚠️ Seeding error:', err.message);
  }
}

// ======================== AUTH ========================
async function registerUser({ contact, password, role = 'farmer', name, village = 'Barabanki, Uttar Pradesh', phone: givenPhone }) {
  ensureDataFile();
  const status = getDBStatus();
  const cleanContact = String(contact).trim();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const phone = (givenPhone && String(givenPhone).trim()) || (cleanContact.includes('@') ? '98765 43210' : cleanContact);
  const bank = role === 'buyer' ? 'HDFC ••••8819' : 'PNB ••••4471';

  if (status.isConnected) {
    const existing = await User.findOne({ contact: cleanContact });
    if (existing) {
      throw new Error('User with this mobile/email already exists');
    }
    const newUser = await User.create({
      contact: cleanContact,
      password: passwordHash,
      role,
      name: name || (role === 'buyer' ? 'Agro Buyer Partner' : 'किसान साथी'),
      village,
      phone,
      bank
    });
    return {
      id: newUser._id,
      contact: newUser.contact,
      role: newUser.role,
      name: newUser.name,
      village: newUser.village,
      phone: newUser.phone,
      bank: newUser.bank
    };
  } else {
    const existing = inMemoryStore.users.find(u => u.contact === cleanContact);
    if (existing) {
      throw new Error('User with this mobile/email already exists');
    }
    const newUser = {
      id: uid('U'),
      contact: cleanContact,
      passwordHash,
      role,
      name: name || (role === 'buyer' ? 'Agro Buyer Partner' : 'किसान साथी'),
      village,
      phone,
      bank
    };
    inMemoryStore.users.push(newUser);
    saveStore();
    return {
      id: newUser.id,
      contact: newUser.contact,
      role: newUser.role,
      name: newUser.name,
      village: newUser.village,
      phone: newUser.phone,
      bank: newUser.bank
    };
  }
}

async function loginUser(contact, password) {
  ensureDataFile();
  const status = getDBStatus();
  const cleanContact = String(contact).trim();

  let user = null;
  let isPasswordValid = false;

  if (status.isConnected) {
    user = await User.findOne({ contact: cleanContact });
    if (!user) {
      throw new Error('User not found. Please register first.');
    }
    isPasswordValid = await bcrypt.compare(password, user.password);
  } else {
    user = inMemoryStore.users.find(u => u.contact === cleanContact);
    if (!user) {
      throw new Error('User not found. Please register first.');
    }
    // Check either hashed or demo plain password
    if (user.passwordHash) {
      isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid && process.env.NODE_ENV !== 'production' && (password === 'password123' || password === 'admin123')) isPasswordValid = true;
    } else {
      isPasswordValid = user.password === password;
    }
  }

  // If password matches or demo convenience
  if (!isPasswordValid) {
    throw new Error('Invalid contact or password');
  }

  return {
    id: user._id || user.id,
    contact: user.contact,
    role: user.role,
    name: user.name,
    village: user.village,
    phone: user.phone || cleanContact,
    bank: user.bank || 'PNB ••••4471'
  };
}

async function userExists(contact) {
  ensureDataFile();
  const cleanContact = String(contact).trim();
  if (getDBStatus().isConnected) {
    return Boolean(await User.findOne({ contact: cleanContact }));
  }
  return inMemoryStore.users.some(u => u.contact === cleanContact);
}

async function resetPassword(contact, newPassword) {
  ensureDataFile();
  const cleanContact = String(contact).trim();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  if (getDBStatus().isConnected) {
    const user = await User.findOne({ contact: cleanContact });
    if (!user) throw new Error('User not found');
    user.password = passwordHash;
    await user.save();
    return true;
  }
  const user = inMemoryStore.users.find(u => u.contact === cleanContact);
  if (!user) throw new Error('User not found');
  user.passwordHash = passwordHash;
  delete user.password;
  saveStore();
  return true;
}

async function updateUserProfile(contact, updates = {}) {
  ensureDataFile();
  const status = getDBStatus();
  const cleanContact = String(contact).trim();

  if (status.isConnected) {
    const user = await User.findOne({ contact: cleanContact });
    if (!user) throw new Error('User not found');
    if (updates.name) user.name = updates.name.trim();
    if (updates.village) user.village = updates.village.trim();
    if (updates.bank) user.bank = updates.bank.trim();
    if (updates.phone) user.phone = updates.phone.trim();
    await user.save();
    return {
      id: user._id,
      contact: user.contact,
      role: user.role,
      name: user.name,
      village: user.village,
      phone: user.phone,
      bank: user.bank
    };
  } else {
    const user = inMemoryStore.users.find(u => u.contact === cleanContact);
    if (!user) throw new Error('User not found');
    if (updates.name) user.name = updates.name.trim();
    if (updates.village) user.village = updates.village.trim();
    if (updates.bank) user.bank = updates.bank.trim();
    if (updates.phone) user.phone = updates.phone.trim();
    saveStore();
    return {
      id: user.id || user._id,
      contact: user.contact,
      role: user.role,
      name: user.name,
      village: user.village,
      phone: user.phone,
      bank: user.bank
    };
  }
}

// ======================== LISTINGS ========================
async function getListings(filters = {}) {
  ensureDataFile();
  const status = getDBStatus();

  let list = [];
  if (status.isConnected) {
    list = await Listing.find().sort({ created: -1 }).lean();
  } else {
    list = inMemoryStore.listings || [];
  }

  if (filters.state) {
    list = list.filter(l => l.state.toLowerCase() === filters.state.toLowerCase());
  }
  if (filters.grade) {
    list = list.filter(l => l.grade.toLowerCase() === filters.grade.toLowerCase());
  }
  if (filters.cropKey) {
    list = list.filter(l => l.cropKey.toLowerCase() === filters.cropKey.toLowerCase());
  }
  return list;
}

async function createListing(data) {
  ensureDataFile();
  const status = getDBStatus();

  const newLot = {
    id: data.id || uid('L'),
    cropKey: data.cropKey,
    qty: Number(data.qty),
    price: Number(data.price),
    grade: data.grade || 'A',
    state: data.state || 'Uttar Pradesh',
    district: data.district || 'Barabanki',
    farmer: data.farmerName || data.farmer || 'रामकिशन यादव',
    photo: data.photo || null,
    status: 'active',
    mine: data.mine !== undefined ? data.mine : false,
    created: Date.now()
  };

  let saved;
  if (status.isConnected) {
    saved = await Listing.create(newLot);
  } else {
    inMemoryStore.listings.unshift(newLot);
    saveStore();
    saved = newLot;
  }

  emitEvent('listing:created', newLot);
  return saved;
}

// ======================== BIDS ========================
async function getBids(listingId = null) {
  ensureDataFile();
  const status = getDBStatus();

  if (status.isConnected) {
    const q = listingId ? { listingId } : {};
    return await Bid.find(q).sort({ created: -1 }).lean();
  } else {
    let bids = inMemoryStore.bids || [];
    if (listingId) bids = bids.filter(b => b.listingId === listingId);
    return bids;
  }
}

async function createBid({ id, listingId, rate, qty, note = '', buyerName = 'Agro Fresh Retail' }) {
  ensureDataFile();
  const status = getDBStatus();

  const newBid = {
    id: id || uid('B'),
    listingId,
    buyer: buyerName,
    rate: Number(rate),
    qty: Number(qty),
    note,
    status: 'pending',
    mine: false,
    created: Date.now()
  };

  let saved;
  if (status.isConnected) {
    saved = await Bid.create(newBid);
  } else {
    inMemoryStore.bids.unshift(newBid);
    saveStore();
    saved = newBid;
  }

  emitEvent('bid:created', newBid);
  return saved;
}

async function acceptBid(bidId) {
  ensureDataFile();
  const status = getDBStatus();

  let bid, listing;
  if (status.isConnected) {
    bid = await Bid.findOne({ $or: [{ id: bidId }, { _id: bidId.match(/^[0-9a-fA-F]{24}$/) ? bidId : null }] });
    if (!bid) throw new Error('Bid not found');
    listing = await Listing.findOne({ id: bid.listingId });
    if (!listing) throw new Error('Listing not found');

    bid.status = 'accepted';
    await bid.save();

    // Reject other pending bids on same listing
    await Bid.updateMany({ listingId: listing.id, id: { $ne: bid.id }, status: 'pending' }, { status: 'rejected' });
    listing.status = 'sold';
    await listing.save();

    const amount = bid.rate * bid.qty;
    const commission = Math.round(amount * 0.02);

    const deal = await Deal.create({
      id: uid('D'),
      listingId: listing.id,
      farmer: listing.farmer,
      buyer: bid.buyer,
      rate: bid.rate,
      qty: bid.qty,
      amount,
      commission,
      escrow: 'held',
      stage: 'confirmed',
      transporter: null,
      quality: null,
      buyerCity: 'Delhi NCR',
      sellerPhone: '98765 43221',
      buyerPhone: '98100 00123',
      created: Date.now()
    });

    const contract = makeContract(deal, listing);
    emitEvent('bid:accepted', {
      bidId: bid.id,
      listingId: listing.id,
      farmer: listing.farmer,
      buyer: bid.buyer,
      rate: bid.rate,
      qty: bid.qty,
      dealId: deal.id
    });
    emitEvent('deal:created', { deal, contract });
    return { deal, contract };
  } else {
    bid = inMemoryStore.bids.find(b => b.id === bidId || b._id === bidId);
    if (!bid) throw new Error('Bid not found');
    listing = inMemoryStore.listings.find(l => l.id === bid.listingId);
    if (!listing) throw new Error('Listing not found');

    bid.status = 'accepted';
    inMemoryStore.bids
      .filter(x => x.listingId === listing.id && x.id !== bid.id && x.status === 'pending')
      .forEach(x => { x.status = 'rejected'; });

    listing.status = 'sold';

    const amount = bid.rate * bid.qty;
    const commission = Math.round(amount * 0.02);

    const deal = {
      id: uid('D'),
      listingId: listing.id,
      farmer: listing.farmer,
      buyer: bid.buyer,
      rate: bid.rate,
      qty: bid.qty,
      amount,
      commission,
      escrow: 'held',
      stage: 'confirmed',
      transporter: null,
      quality: null,
      buyerCity: 'Delhi NCR',
      sellerPhone: '98765 43221',
      buyerPhone: '98100 00123',
      created: Date.now()
    };
    inMemoryStore.deals.unshift(deal);

    const contract = makeContract(deal, listing);
    inMemoryStore.contracts.unshift(contract);

    // Add escrow transaction to wallet
    inMemoryStore.wallet.txns.unshift({
      id: uid('W'),
      kind: 'hold',
      label: `${listing.cropKey} — ${bid.qty} qtl (held in escrow)`,
      amt: 0,
      when: Date.now()
    });

    saveStore();
    emitEvent('bid:accepted', {
      bidId: bid.id,
      listingId: listing.id,
      farmer: listing.farmer,
      buyer: bid.buyer,
      rate: bid.rate,
      qty: bid.qty,
      dealId: deal.id
    });
    emitEvent('deal:created', { deal, contract });
    return { deal, contract };
  }
}

async function rejectBid(bidId) {
  ensureDataFile();
  const status = getDBStatus();

  if (status.isConnected) {
    await Bid.updateOne({ $or: [{ id: bidId }, { _id: bidId.match(/^[0-9a-fA-F]{24}$/) ? bidId : null }] }, { status: 'rejected' });
  } else {
    const bid = inMemoryStore.bids.find(b => b.id === bidId || b._id === bidId);
    if (bid) bid.status = 'rejected';
    saveStore();
  }
  emitEvent('bid:updated', { id: bidId, status: 'rejected' });
  return { success: true };
}

async function counterBid(bidId, counterRate) {
  ensureDataFile();
  const status = getDBStatus();

  if (status.isConnected) {
    await Bid.updateOne(
      { $or: [{ id: bidId }, { _id: bidId.match(/^[0-9a-fA-F]{24}$/) ? bidId : null }] },
      { status: 'countered', counterRate: Number(counterRate) }
    );
  } else {
    const bid = inMemoryStore.bids.find(b => b.id === bidId || b._id === bidId);
    if (bid) {
      bid.status = 'countered';
      bid.counterRate = Number(counterRate);
    }
    saveStore();
  }
  emitEvent('bid:updated', { id: bidId, status: 'countered', counterRate });
  return { success: true, counterRate };
}

async function acceptCounter(bidId) {
  ensureDataFile();
  const status = getDBStatus();

  if (status.isConnected) {
    const bid = await Bid.findOne({ $or: [{ id: bidId }, { _id: bidId.match(/^[0-9a-fA-F]{24}$/) ? bidId : null }] });
    if (bid && bid.counterRate) {
      bid.rate = bid.counterRate;
      bid.status = 'pending';
      await bid.save();
    }
  } else {
    const bid = inMemoryStore.bids.find(b => b.id === bidId || b._id === bidId);
    if (bid && bid.counterRate) {
      bid.rate = bid.counterRate;
      bid.status = 'pending';
    }
    saveStore();
  }
  emitEvent('bid:updated', { id: bidId, status: 'pending' });
  return { success: true };
}

// ======================== DEALS & ESCROW ========================
async function getDeals() {
  ensureDataFile();
  const status = getDBStatus();
  if (status.isConnected) {
    return await Deal.find().sort({ created: -1 }).lean();
  }
  return inMemoryStore.deals || [];
}

const STAGES = ['confirmed', 'pickup', 'transit', 'delivered'];

async function advanceDeal(dealId) {
  ensureDataFile();
  const status = getDBStatus();

  let deal;
  if (status.isConnected) {
    deal = await Deal.findOne({ $or: [{ id: dealId }, { _id: dealId.match(/^[0-9a-fA-F]{24}$/) ? dealId : null }] });
    if (!deal) throw new Error('Deal not found');

    const i = STAGES.indexOf(deal.stage);
    if (i < STAGES.length - 1) {
      deal.stage = STAGES[i + 1];
    }
    if (deal.stage === 'transit' && deal.escrow === 'held') {
      deal.escrow = 'released';
    }
    await deal.save();
  } else {
    deal = inMemoryStore.deals.find(d => d.id === dealId || d._id === dealId);
    if (!deal) throw new Error('Deal not found');

    const i = STAGES.indexOf(deal.stage);
    if (i < STAGES.length - 1) {
      deal.stage = STAGES[i + 1];
    }
    if (deal.stage === 'transit' && deal.escrow === 'held') {
      deal.escrow = 'released';
      const net = deal.amount - deal.commission;
      inMemoryStore.wallet.balance += net;
      inMemoryStore.wallet.txns.unshift({
        id: uid('W'),
        kind: 'in',
        label: `${deal.buyer} — ${deal.qty} qtl`,
        amt: net,
        when: Date.now()
      });
    }
    saveStore();
  }

  emitEvent('deal:stage', { dealId, stage: deal.stage, escrow: deal.escrow });
  return deal;
}

async function assignDriver(dealId, transporter) {
  ensureDataFile();
  const status = getDBStatus();

  let deal;
  if (status.isConnected) {
    deal = await Deal.findOne({ $or: [{ id: dealId }, { _id: dealId.match(/^[0-9a-fA-F]{24}$/) ? dealId : null }] });
    if (!deal) throw new Error('Deal not found');

    deal.transporter = transporter;
    deal.track = { p: 0, km: 0 };
    if (deal.stage === 'confirmed') deal.stage = 'pickup';
    await deal.save();
  } else {
    deal = inMemoryStore.deals.find(d => d.id === dealId || d._id === dealId);
    if (!deal) throw new Error('Deal not found');

    deal.transporter = transporter;
    deal.track = { p: 0, km: 0 };
    if (deal.stage === 'confirmed') deal.stage = 'pickup';
    saveStore();
  }

  emitEvent('deal:driver', { dealId, transporter });
  return deal;
}

async function releaseEscrow(dealId) {
  ensureDataFile();
  const status = getDBStatus();

  let deal;
  if (status.isConnected) {
    deal = await Deal.findOne({ $or: [{ id: dealId }, { _id: dealId.match(/^[0-9a-fA-F]{24}$/) ? dealId : null }] });
    if (!deal || deal.escrow === 'released') return { deal, alreadyReleased: true };

    deal.escrow = 'released';
    await deal.save();
  } else {
    deal = inMemoryStore.deals.find(d => d.id === dealId || d._id === dealId);
    if (!deal || deal.escrow === 'released') return { deal, alreadyReleased: true };

    deal.escrow = 'released';
    const net = deal.amount - deal.commission;
    inMemoryStore.wallet.balance += net;
    inMemoryStore.wallet.txns.unshift({
      id: uid('W'),
      kind: 'in',
      label: `${deal.buyer} — ${deal.qty} qtl (manual escrow release)`,
      amt: net,
      when: Date.now()
    });
    saveStore();
  }

  emitEvent('deal:escrow_released', { dealId });
  return { deal, released: true };
}

async function bookQC(dealId, qualityText) {
  ensureDataFile();
  const status = getDBStatus();
  const text = qualityText || 'Moisture 11.4% · Grade A confirmed';

  if (status.isConnected) {
    await Deal.updateOne(
      { $or: [{ id: dealId }, { _id: dealId.match(/^[0-9a-fA-F]{24}$/) ? dealId : null }] },
      { quality: text }
    );
  } else {
    const deal = inMemoryStore.deals.find(d => d.id === dealId || d._id === dealId);
    if (deal) deal.quality = text;
    saveStore();
  }
  emitEvent('deal:qc_booked', { dealId, quality: text });
  return { success: true, quality: text };
}

// ======================== EQUIPMENT ========================
async function getEquipment() {
  ensureDataFile();
  const status = getDBStatus();
  if (status.isConnected) {
    return await Equipment.find().sort({ created: -1 }).lean();
  }
  return inMemoryStore.equipment || [];
}

async function addEquipment(data) {
  ensureDataFile();
  const status = getDBStatus();

  const newEq = {
    id: data.id || uid('E'),
    name: data.name,
    em: data.em || '🚜',
    owner: data.owner || 'रामकिशन यादव',
    location: data.location || 'Barabanki, Uttar Pradesh',
    rate: Number(data.rate),
    unit: data.unit || 'hr',
    mine: true,
    available: true,
    created: Date.now()
  };

  let saved;
  if (status.isConnected) {
    saved = await Equipment.create(newEq);
  } else {
    inMemoryStore.equipment.unshift(newEq);
    saveStore();
    saved = newEq;
  }

  emitEvent('equipment:added', newEq);
  return saved;
}

async function bookEquipment(equipId) {
  ensureDataFile();
  const status = getDBStatus();

  if (status.isConnected) {
    await Equipment.updateOne(
      { $or: [{ id: equipId }, { _id: equipId.match(/^[0-9a-fA-F]{24}$/) ? equipId : null }] },
      { available: false }
    );
  } else {
    const eq = inMemoryStore.equipment.find(e => e.id === equipId || e._id === equipId);
    if (eq) eq.available = false;
    saveStore();
  }

  emitEvent('equipment:booked', { id: equipId });
  return { success: true };
}

// ======================== WALLET ========================
async function getWallet() {
  ensureDataFile();
  return inMemoryStore.wallet;
}

async function withdrawFunds() {
  ensureDataFile();
  const bal = inMemoryStore.wallet.balance;
  if (bal <= 0) throw new Error('No balance to withdraw');

  inMemoryStore.wallet.txns.unshift({
    id: uid('W'),
    kind: 'out',
    label: 'बैंक ट्रांसफर PNB ••••4471',
    amt: -bal,
    when: Date.now()
  });
  inMemoryStore.wallet.balance = 0;
  saveStore();
  emitEvent('wallet:updated', inMemoryStore.wallet);
  return { withdrawn: bal, currentBalance: 0 };
}

// ======================== TOOLS: AI DISEASE & SOIL ========================
const DISEASES_DB = {
  tomato: [
    { hi: 'अगेती झुलसा (Early blight)', en: 'Early blight', hi_a: 'मैंकोज़ेब 75% WP, 2 ग्राम/लीटर पानी में छिड़कें। रोगी पत्तियाँ तोड़कर नष्ट करें।', en_a: 'Spray Mancozeb 75% WP at 2g/litre water. Remove and destroy infected leaves.' },
    { hi: 'पत्ती मरोड़ विषाणु (Leaf curl virus)', en: 'Leaf curl virus', hi_a: 'सफेद मक्खी नियंत्रण हेतु इमिडाक्लोप्रिड 0.5ml/लीटर छिड़कें।', en_a: 'Spray Imidacloprid 0.5ml/litre to control whitefly vector.' }
  ],
  onion: [
    { hi: 'बैंगनी धब्बा (Purple blotch)', en: 'Purple blotch', hi_a: 'मैंकोज़ेब 2g/लीटर या क्लोरोथैलोनिल का छिड़काव करें।', en_a: 'Spray Mancozeb 2g/litre or Chlorothalonil.' }
  ],
  potato: [
    { hi: 'पिछेती झुलसा (Late blight)', en: 'Late blight', hi_a: 'मेटालैक्सिल+मैंकोज़ेब का छिड़काव करें। शाम को सिंचाई न करें।', en_a: 'Spray Metalaxyl + Mancozeb combination. Avoid evening irrigation.' }
  ],
  wheat: [
    { hi: 'पीला रतुआ (Yellow rust)', en: 'Yellow rust', hi_a: 'प्रोपिकोनाज़ोल 1ml/लीटर का छिड़काव करें।', en_a: 'Spray Propiconazole 1ml/litre.' }
  ]
};

async function scanDisease(cropKey, photoUrl, lang = 'hi') {
  ensureDataFile();
  const crop = (cropKey || 'tomato').toLowerCase();
  const list = DISEASES_DB[crop] || DISEASES_DB.tomato;
  const picked = list[Math.floor(Math.random() * list.length)];
  const conf = 85 + Math.floor(Math.random() * 12);
  const name = lang === 'en' ? picked.en : picked.hi;
  const advice = lang === 'en' ? picked.en_a : picked.hi_a;

  const result = {
    cropKey: crop,
    name,
    advice,
    conf,
    photo: photoUrl || null,
    when: Date.now()
  };

  inMemoryStore.scans.unshift(result);
  saveStore();
  return result;
}

const IDEAL_NPK = {
  tomato: { n: 120, p: 60, k: 60 },
  onion: { n: 100, p: 50, k: 50 },
  potato: { n: 150, p: 80, k: 100 },
  wheat: { n: 120, p: 60, k: 40 },
  paddy: { n: 100, p: 50, k: 50 },
  soy: { n: 30, p: 60, k: 40 },
  gram: { n: 20, p: 50, k: 20 },
  maize: { n: 120, p: 60, k: 40 }
};

async function getSoilAdvisory(n, p, k, lang = 'hi') {
  ensureDataFile();
  const N = Number(n) || 0;
  const P = Number(p) || 0;
  const K = Number(k) || 0;

  const scored = Object.keys(IDEAL_NPK).map(key => {
    const ideal = IDEAL_NPK[key];
    const dist = Math.sqrt((N - ideal.n) ** 2 + (P - ideal.p) ** 2 + (K - ideal.k) ** 2);
    return { key, dist, ideal };
  }).sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  const match = Math.max(35, Math.round(100 - best.dist / 4));
  const dn = best.ideal.n - N;
  const dp = best.ideal.p - P;
  const dk = best.ideal.k - K;

  const en = lang === 'en';
  const fertBits = [];
  if (dn > 10) fertBits.push(en ? `add ~${Math.round(dn * 2.2)}kg/ha urea` : `~${Math.round(dn * 2.2)}kg/ha यूरिया डालें`);
  if (dp > 10) fertBits.push(en ? `add ~${Math.round(dp * 6.25)}kg/ha DAP` : `~${Math.round(dp * 6.25)}kg/ha DAP डालें`);
  if (dk > 10) fertBits.push(en ? `add ~${Math.round(dk * 1.7)}kg/ha MOP` : `~${Math.round(dk * 1.7)}kg/ha MOP डालें`);

  const fertText = fertBits.length ? fertBits.join('; ') : (en ? 'NPK levels look balanced.' : 'NPK संतुलित है।');

  const adviceObj = {
    bestCrop: best.key,
    match,
    fertilizer: fertText,
    ideal: best.ideal,
    input: { n: N, p: P, k: K },
    when: Date.now()
  };

  inMemoryStore.soilAdvice.unshift(adviceObj);
  saveStore();
  return adviceObj;
}

// ======================== RETURN & REFUND MANAGEMENT ========================

// Helpers: Render par server restart/sleep hone par memory (data/db.json) khali ho jati hai, par asli data MongoDB me hota hai.
// Isliye pehle memory dekhte hain, na mile to MongoDB se uthate hain.
const CLOSED_RETURN_STATUSES = ['CLOSED', 'REJECTED', 'CANCELLED'];

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findDeal(id) {
  inMemoryStore.deals = inMemoryStore.deals || [];
  const mem = inMemoryStore.deals.find(d => d.id === id);
  if (mem) return mem;
  if (getDBStatus().isConnected) {
    try { return await Deal.findOne({ id }).lean(); } catch (e) { console.error('findDeal failed:', e.message); }
  }
  return null;
}

async function findListing(id) {
  if (!id) return null;
  const mem = (inMemoryStore.listings || []).find(l => l.id === id);
  if (mem) return mem;
  if (getDBStatus().isConnected) {
    try { return await Listing.findOne({ id }).lean(); } catch (e) { /* ignore */ }
  }
  return null;
}

async function findReturn(id) {
  inMemoryStore.returns = inMemoryStore.returns || [];
  const mem = inMemoryStore.returns.find(r => r.id === id);
  if (mem) return mem;
  if (getDBStatus().isConnected) {
    try {
      const doc = await ReturnRequest.findOne({ id }).lean();
      if (doc) {
        delete doc._id; delete doc.__v;
        inMemoryStore.returns.unshift(doc); // memory me bhi rakh lo, aage ke updates isi par honge
        return doc;
      }
    } catch (e) { console.error('findReturn failed:', e.message); }
  }
  return null;
}

async function persistReturn(ret, returnId) {
  if (!getDBStatus().isConnected) return;
  try {
    const copy = { ...ret }; delete copy._id; delete copy.__v;
    await ReturnRequest.updateOne({ id: returnId }, { $set: copy });
  } catch (e) {
    console.error('Error updating return in MongoDB:', e.message);
  }
}

async function getReturns(filter = {}) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];
  const dbStatus = getDBStatus();

  let results = [];
  if (dbStatus.isConnected) {
    try {
      const q = {};
      if (filter.role === 'farmer' && filter.user) {
        q.farmer = new RegExp(escapeRegex(filter.user), 'i');
      } else if (filter.role === 'buyer' && filter.user) {
        q.buyer = new RegExp(escapeRegex(filter.user), 'i');
      }
      if (filter.dealId) q.dealId = filter.dealId;
      if (filter.status && filter.status !== 'all') q.status = filter.status;
      results = await ReturnRequest.find(q).sort({ created: -1 }).lean();
    } catch (e) {
      console.warn('MongoDB getReturns failed, using inMemoryStore', e.message);
      results = inMemoryStore.returns || [];
    }
  } else {
    results = inMemoryStore.returns || [];
  }

  // Filter in memory if MongoDB is offline or fallback
  if (!dbStatus.isConnected) {
    let list = inMemoryStore.returns || [];
    if (filter.role === 'farmer' && filter.user) {
      const u = filter.user.trim().toLowerCase();
      list = list.filter(r => (r.farmer || '').toLowerCase().includes(u) || u.includes((r.farmer || '').toLowerCase()));
    } else if (filter.role === 'buyer' && filter.user) {
      const u = filter.user.trim().toLowerCase();
      list = list.filter(r => (r.buyer || '').toLowerCase().includes(u) || u.includes((r.buyer || '').toLowerCase()));
    }
    if (filter.dealId) list = list.filter(r => r.dealId === filter.dealId);
    if (filter.status && filter.status !== 'all') list = list.filter(r => r.status === filter.status);
    results = list.sort((a, b) => (b.created || 0) - (a.created || 0));
  }

  return results;
}

async function getReturnById(id) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];
  const dbStatus = getDBStatus();
  if (dbStatus.isConnected) {
    try {
      const found = await ReturnRequest.findOne({ id }).lean();
      if (found) return found;
    } catch (e) {}
  }
  return (inMemoryStore.returns || []).find(r => r.id === id) || null;
}

async function createReturnRequest(data) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  if (!data.dealId) throw new Error('Deal ID is required');
  const deal = await findDeal(data.dealId);
  if (!deal) throw new Error(`Deal #${data.dealId} not found`);

  // Prevent duplicate open returns (memory + MongoDB dono me dekhte hain)
  let existing = (inMemoryStore.returns || []).find(r => r.dealId === data.dealId && !CLOSED_RETURN_STATUSES.includes(r.status));
  if (!existing && getDBStatus().isConnected) {
    try { existing = await ReturnRequest.findOne({ dealId: data.dealId, status: { $nin: CLOSED_RETURN_STATUSES } }).lean(); } catch (e) { /* ignore */ }
  }
  if (existing) {
    throw new Error(`An active return request (${existing.id}) already exists for Deal #${data.dealId}`);
  }

  const qtyOrdered = Number(deal.qty) || 1;
  const qtyReceived = Number(data.qtyReceived) || qtyOrdered;
  const qtyAffected = Math.min(Number(data.qtyAffected) || qtyReceived, qtyReceived);
  if (qtyAffected <= 0) throw new Error('Affected quantity must be greater than zero');

  const ratePerQtl = Number(deal.rate) || 0;
  const dealAmount = Number(deal.amount) || (qtyOrdered * ratePerQtl);
  const estimatedRefund = Math.round((qtyAffected / qtyOrdered) * dealAmount);
  const estimatedReturnShipping = Math.round(Math.min(1500, Math.max(350, qtyAffected * 15)));

  const listing = await findListing(deal.listingId);
  const returnId = uid('RET');
  const now = Date.now();

  const newReturn = {
    id: returnId,
    dealId: deal.id,
    listingId: deal.listingId || '',
    cropKey: data.cropKey || (listing && listing.cropKey) || 'crop',
    cropName: data.cropName || (listing && (listing.cropName || listing.cropKey)) || data.cropKey || 'फसल',
    buyer: data.buyer || deal.buyer,
    buyerPhone: data.buyerPhone || deal.buyerPhone || '',
    farmer: deal.farmer,
    farmerPhone: deal.sellerPhone || '',
    reason: data.reason || 'damaged_crop',
    description: data.description || '',
    evidenceUrls: Array.isArray(data.evidenceUrls) ? data.evidenceUrls : [],
    qtyOrdered,
    qtyReceived,
    qtyAffected,
    ratePerQtl,
    dealAmount,
    estimatedRefund,
    estimatedReturnShipping,
    resolutionRequested: data.resolutionRequested || 'full_refund',
    status: 'REQUESTED',
    isPerishable: data.isPerishable !== false,
    dispositionAction: data.dispositionAction || (data.isPerishable !== false ? 'local_disposal' : 'physical_return'),
    farmerResponse: {
      respondedAt: null,
      action: 'pending',
      notes: '',
      dispatchEvidenceUrls: [],
      packagingProof: ''
    },
    adminDecision: {
      decidedAt: null,
      adminName: '',
      decision: 'pending',
      resolutionType: 'none',
      refundAmount: 0,
      shippingCost: 0,
      costBearer: 'uncertain',
      mandatoryReason: '',
      notes: ''
    },
    logistics: {
      shipmentId: '',
      transporterName: '',
      trackingRef: '',
      pickupAddress: `${deal.buyerCity || 'Delhi NCR'}`,
      destinationAddress: `Mandi / Farm of ${deal.farmer}`,
      pickupDate: '',
      status: 'not_required'
    },
    logisticsProtection: {
      optedIn: !!data.logisticsProtectionOptIn,
      feeCharged: data.logisticsProtectionOptIn ? Math.round(dealAmount * 0.015) : 0,
      coverageAmount: data.logisticsProtectionOptIn ? dealAmount : 0
    },
    timeline: [
      {
        status: 'REQUESTED',
        by: 'Buyer',
        actorName: data.buyer || deal.buyer,
        note: `Return/complaint filed for ${qtyAffected} qtl. Reason: ${data.reason}. Resolution requested: ${data.resolutionRequested || 'full_refund'}.`,
        at: now
      }
    ],
    evidenceRequests: [],
    evidenceSubmissions: [],
    created: now,
    updated: now
  };

  // Pehle MongoDB me save karo. Fail ho to user ko saaf error dikhao (pehle ye chupchap ignore ho jata tha
  // aur complaint list se gayab ho jati thi).
  const dbStatus = getDBStatus();
  if (dbStatus.isConnected) {
    try {
      await ReturnRequest.create(newReturn);
    } catch (e) {
      console.error('Error saving return to MongoDB:', e.message);
      throw new Error('Complaint save nahi ho paayi: ' + e.message);
    }
  }
  inMemoryStore.returns.unshift(newReturn);
  saveStore();

  emitEvent('return:created', newReturn);
  return newReturn;
}

async function farmerRespondReturn(returnId, farmerName, payload) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  const ret = await findReturn(returnId);
  if (!ret) throw new Error(`Return request #${returnId} not found`);

  const fName = (farmerName || '').trim().toLowerCase();
  const rFarmer = (ret.farmer || '').trim().toLowerCase();
  if (fName && rFarmer && !rFarmer.includes(fName) && !fName.includes(rFarmer) && fName !== 'admin') {
    throw new Error('Unauthorized: You can only respond to complaints on your own orders');
  }

  const now = Date.now();
  const action = payload.action === 'accept' ? 'accept' : 'dispute';
  ret.farmerResponse = {
    respondedAt: now,
    action,
    decision: action,
    notes: payload.notes || '',
    explanation: payload.notes || '',
    dispatchEvidenceUrls: Array.isArray(payload.dispatchEvidenceUrls) ? payload.dispatchEvidenceUrls : [],
    dispatchProofUrls: Array.isArray(payload.dispatchEvidenceUrls) ? payload.dispatchEvidenceUrls : [],
    packagingProof: payload.packagingProof || ''
  };

  if (action === 'accept') {
    ret.status = 'UNDER_REVIEW';
    ret.timeline.push({
      status: 'UNDER_REVIEW',
      by: 'Farmer',
      actorName: farmerName,
      note: `Farmer accepted the complaint claim: "${payload.notes || 'No dispute'}". Forwarded to Admin for refund confirmation.`,
      at: now
    });
  } else {
    ret.status = 'DISPUTE_ESCALATED';
    ret.timeline.push({
      status: 'DISPUTE_ESCALATED',
      by: 'Farmer',
      actorName: farmerName,
      note: `Farmer disputed the complaint with dispatch proof: "${payload.notes || 'Dispatched in verified grade/condition'}". Escalated to Admin for review.`,
      at: now
    });
  }

  ret.updated = now;
  saveStore();

  await persistReturn(ret, returnId);

  emitEvent('return:updated', ret);
  return ret;
}

async function adminResolveReturn(returnId, adminName, payload) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  const ret = await findReturn(returnId);
  if (!ret) throw new Error(`Return request #${returnId} not found`);

  if (!payload.mandatoryReason || !payload.mandatoryReason.trim()) {
    throw new Error('Mandatory decision reason is required for admin resolution');
  }

  const now = Date.now();
  const decision = payload.decision; // 'approved' | 'rejected' | 'escalated'
  const resolutionType = payload.resolutionType || 'full_refund';
  const costBearer = payload.costBearer || 'seller';
  const refundAmount = Number(payload.refundAmount) != null && !isNaN(Number(payload.refundAmount))
    ? Number(payload.refundAmount)
    : (resolutionType === 'full_refund' ? ret.dealAmount : ret.estimatedRefund);
  const shippingCost = Number(payload.shippingCost) || 0;
  const dispositionAction = payload.dispositionAction || (ret.isPerishable ? 'local_disposal' : 'physical_return');

  ret.dispositionAction = dispositionAction;

  if (decision === 'rejected') {
    ret.status = 'REJECTED';
    ret.adminDecision = {
      decidedAt: now,
      adminName: adminName || 'Admin',
      decidedBy: adminName || 'Admin',
      decision: 'rejected',
      resolution: 'reject',
      resolutionType: 'no_refund',
      refundAmount: 0,
      approvedRefund: 0,
      shippingCost: 0,
      costBearer: 'uncertain',
      decisionReason: payload.mandatoryReason,
      mandatoryReason: payload.mandatoryReason,
      dispositionAction,
      notes: payload.notes || ''
    };
    ret.timeline.push({
      status: 'REJECTED',
      by: 'Admin',
      actorName: adminName || 'Admin',
      note: `Admin rejected return request: ${payload.mandatoryReason}`,
      at: now
    });
  } else if (decision === 'approved') {
    ret.adminDecision = {
      decidedAt: now,
      adminName: adminName || 'Admin',
      decidedBy: adminName || 'Admin',
      decision: 'approved',
      resolution: resolutionType,
      resolutionType,
      refundAmount,
      approvedRefund: refundAmount,
      shippingCost,
      costBearer,
      decisionReason: payload.mandatoryReason,
      mandatoryReason: payload.mandatoryReason,
      dispositionAction,
      notes: payload.notes || ''
    };

    if (resolutionType === 'replacement') {
      ret.status = 'REPLACEMENT_APPROVED';
      ret.timeline.push({
        status: 'REPLACEMENT_APPROVED',
        by: 'Admin',
        actorName: adminName || 'Admin',
        note: `Replacement approved for ${ret.qtyAffected} qtl of ${ret.cropName}. Reason: ${payload.mandatoryReason}`,
        at: now
      });
    } else {
      ret.status = 'REFUNDED';
      
      // Credit Buyer Wallet
      inMemoryStore.wallet = inMemoryStore.wallet || { balance: 0, txns: [] };
      inMemoryStore.wallet.balance += refundAmount;
      inMemoryStore.wallet.txns.unshift({
        id: uid('TX'),
        kind: 'in',
        label: `रिफंड: ${ret.cropName} (${ret.qtyAffected} qtl) — #${ret.id}`,
        amt: refundAmount,
        when: now
      });

      // If seller is at fault, record adjustment
      const deal = await findDeal(ret.dealId);
      if (deal && costBearer === 'seller') {
        deal.quality = `Return/Refund adjusted (-₹${refundAmount})`;
        if (getDBStatus().isConnected) {
          try { await Deal.updateOne({ id: ret.dealId }, { $set: { quality: deal.quality } }); } catch (e) { console.error('Deal update failed:', e.message); }
        }
      }

      ret.timeline.push({
        status: ret.status,
        by: 'Admin',
        actorName: adminName || 'Admin',
        note: `Approved refund of ₹${refundAmount} (${resolutionType}) to buyer. Cost bearer: ${costBearer}. Disposition: ${dispositionAction}. Reason: ${payload.mandatoryReason}`,
        at: now
      });
    }

    if (dispositionAction === 'physical_return') {
      ret.logistics.status = 'pending_pickup';
      ret.logistics.shipmentId = uid('RET-SHP');
      ret.timeline.push({
        status: 'PICKUP_SCHEDULED',
        by: 'System',
        actorName: 'Reverse Logistics',
        note: `Physical return pickup generated (${ret.logistics.shipmentId}). Courier dispatched to buyer location.`,
        at: now
      });
    }
  } else if (decision === 'escalated') {
    ret.status = 'DISPUTE_ESCALATED';
    ret.timeline.push({
      status: 'DISPUTE_ESCALATED',
      by: 'Admin',
      actorName: adminName || 'Admin',
      note: `Dispute escalated for high-level committee review: ${payload.mandatoryReason}`,
      at: now
    });
  }

  ret.updated = now;
  saveStore();

  await persistReturn(ret, returnId);

  emitEvent('return:updated', ret);
  emitEvent('return:resolved', { returnId, status: ret.status, refundAmount });
  return ret;
}

async function requestMoreEvidence(returnId, adminName, payload) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  const ret = await findReturn(returnId);
  if (!ret) throw new Error(`Return request #${returnId} not found`);

  if (!payload.message || !payload.message.trim()) {
    throw new Error('Message is required when requesting more evidence');
  }

  const now = Date.now();
  ret.status = 'NEEDS_MORE_EVIDENCE';
  ret.evidenceRequests = ret.evidenceRequests || [];
  ret.evidenceRequests.push({
    requestedBy: adminName || 'Admin',
    targetParty: payload.targetParty || 'both',
    message: payload.message,
    requestedAt: now,
    resolved: false
  });

  ret.timeline.push({
    status: 'NEEDS_MORE_EVIDENCE',
    by: 'Admin',
    actorName: adminName || 'Admin',
    note: `Additional evidence requested from ${payload.targetParty || 'both parties'}: "${payload.message}"`,
    at: now
  });

  ret.updated = now;
  saveStore();

  await persistReturn(ret, returnId);

  emitEvent('return:updated', ret);
  return ret;
}

async function submitAdditionalEvidence(returnId, userName, userRole, payload) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  const ret = await findReturn(returnId);
  if (!ret) throw new Error(`Return request #${returnId} not found`);

  const now = Date.now();
  ret.evidenceSubmissions = ret.evidenceSubmissions || [];
  ret.evidenceSubmissions.push({
    submittedBy: userName || 'User',
    role: userRole || 'buyer',
    note: payload.note || '',
    urls: Array.isArray(payload.urls) ? payload.urls : [],
    submittedAt: now
  });

  ret.status = 'UNDER_REVIEW';
  ret.timeline.push({
    status: 'UNDER_REVIEW',
    by: userRole === 'farmer' ? 'Farmer' : 'Buyer',
    actorName: userName,
    note: `Additional evidence submitted: "${payload.note || ''}" (${(payload.urls || []).length} photos/videos)`,
    at: now
  });

  ret.updated = now;
  saveStore();

  await persistReturn(ret, returnId);

  emitEvent('return:updated', ret);
  return ret;
}

async function updateReturnShipment(returnId, payload) {
  ensureDataFile();
  inMemoryStore.returns = inMemoryStore.returns || [];

  const ret = await findReturn(returnId);
  if (!ret) throw new Error(`Return request #${returnId} not found`);

  const now = Date.now();
  const tName = payload.transporterName || payload.courierName || (ret.logistics && ret.logistics.transporterName) || 'Kisaan Express';
  const tRef = payload.trackingRef || payload.trackingNumber || (ret.logistics && ret.logistics.trackingRef) || '';
  ret.logistics = {
    ...ret.logistics,
    transporterName: tName,
    courierName: tName,
    trackingRef: tRef,
    trackingNumber: tRef,
    pickupDate: payload.pickupDate || (ret.logistics && ret.logistics.pickupDate),
    status: payload.status || (ret.logistics && ret.logistics.status)
  };

  if (payload.status === 'in_transit') {
    ret.status = 'RETURN_IN_TRANSIT';
  } else if (payload.status === 'delivered_to_farmer') {
    ret.status = 'RETURN_RECEIVED';
  }

  ret.timeline.push({
    status: ret.status,
    by: 'Logistics',
    actorName: payload.transporterName || 'Logistics Partner',
    note: `Return shipment status updated: ${payload.status} (Ref: ${payload.trackingRef || 'N/A'})`,
    at: now
  });

  ret.updated = now;
  saveStore();

  await persistReturn(ret, returnId);

  emitEvent('return:updated', ret);
  return ret;
}

// ======================== FULL STATE SYNC ========================
async function getFullState() {
  ensureDataFile();
  const listings = await getListings();
  const bids = await getBids();
  const deals = await getDeals();
  const equipment = await getEquipment();
  const wallet = await getWallet();
  const returns = await getReturns();

  return {
    listings,
    bids,
    deals,
    contracts: inMemoryStore.contracts || [],
    returns: returns || inMemoryStore.returns || [],
    equipment,
    wallet,
    prices: inMemoryStore.prices,
    tools: {
      scans: inMemoryStore.scans || [],
      weatherAlerts: false,
      soil: inMemoryStore.soilAdvice[0] || { n: '', p: '', k: '' }
    }
  };
}

module.exports = {
  setSocketIO,
  ensureDataFile,
  seedMongoDBIfNeeded,
  registerUser,
  loginUser,
  updateUserProfile,
  userExists,
  resetPassword,
  getListings,
  createListing,
  getBids,
  createBid,
  acceptBid,
  rejectBid,
  counterBid,
  acceptCounter,
  getDeals,
  advanceDeal,
  assignDriver,
  releaseEscrow,
  bookQC,
  getEquipment,
  addEquipment,
  bookEquipment,
  getWallet,
  withdrawFunds,
  scanDisease,
  getSoilAdvisory,
  getReturns,
  getReturnById,
  createReturnRequest,
  farmerRespondReturn,
  adminResolveReturn,
  requestMoreEvidence,
  submitAdditionalEvidence,
  updateReturnShipment,
  getFullState
};
