require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.log('MongoDB Error:', err);
    process.exit(1);
  });

// =============================
// 1. MODELS
// =============================

// Property Model
const propertySchema = new mongoose.Schema({
  Name: String,
  PropertyTitle: String,
  Price: String,
  Location: String,
  TotalArea: Number,
  Baths: Number,
});
const Property = mongoose.model('Property', propertySchema);

// User Model
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  firstName: String,
  lastName: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
});
const User = mongoose.model('User', userSchema);

// Review Model
const reviewSchema = new mongoose.Schema({
  brokerName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model('Review', reviewSchema);

// Broker Model — fullName is unique and required
const brokerSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true, unique: true }, // <-- UNIQUE
  phone: String,
  license: String,
  agency: String,
  profileImageUrl: String,
  verificationStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'verified', 'rejected'],
    default: 'not_submitted'
  },
  isSubscribed: { type: Boolean, default: false },
  subscriptionEndDate: Date,
});
const Broker = mongoose.model('Broker', brokerSchema);

// Document Model
const documentSchema = new mongoose.Schema({
  brokerEmail: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});
const Document = mongoose.model('Document', documentSchema);

// ProfileView Model — uses fullName
const profileViewSchema = new mongoose.Schema({
  viewedBrokerName: { type: String, required: true, index: true },// <-- fullName
  viewerPhone: { type: String }, // ← phone
  viewerInfo: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const ProfileView = mongoose.model('ProfileView', profileViewSchema);

// =============================
// 2. FILE UPLOAD (Multer)
// =============================
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/documents';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const brokerEmail = req.body.email || 'unknown_broker';
    cb(null, `${brokerEmail}-${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: documentStorage });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================
// 3. ROUTES
// =============================

// Seed Route
app.get('/seed', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'real_estate_data.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Error: real_estate_data.json not found on server');
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const docs = data.map(p => ({
      Name: p.Name,
      PropertyTitle: p['Property Title'],
      Price: p.Price,
      Location: p.Location,
      TotalArea: p.Total_Area,
      Baths: p.Baths,
    }));
    await Property.insertMany(docs, { ordered: false });
    res.send(`Data added! Loaded ${docs.length} properties.`);
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).send('Seed Error: ' + err.message);
  }
});

// Get All Properties
app.get('/api/products', async (req, res) => {
  try {
    const all = await Property.find().lean();
    if (all.length === 0) {
      return res.json({ data: [], message: 'No properties yet - run /seed' });
    }
    const transformed = all.map(p => ({
      Name: p.Name,
      PropertyTitle: p.PropertyTitle,
      Price: p.Price,
      Location: p.Location,
      TotalArea: p.TotalArea,
      Baths: p.Baths,
    }));
    res.json({ data: transformed });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// User: Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, city, state, zip } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, firstName, lastName, phone, address, city, state, zip });
    await user.save();
    res.json({ message: 'User created', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// User: Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });
    res.json({ message: 'Login successful', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// User: Update
app.put('/api/users', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, address, city, state, zip } = req.body;
    const user = await User.findOneAndUpdate(
      { email },
      { firstName, lastName, phone, address, city, state, zip },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User updated', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Review: Submit
app.post('/api/reviews', async (req, res) => {
  try {
    const { brokerName, rating, feedback } = req.body;
    const review = new Review({ brokerName, rating, feedback });
    await review.save();
    res.json({ message: 'Review submitted', review });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Review: Get for Broker
app.get('/api/reviews/:brokerName', async (req, res) => {
  try {
    const { brokerName } = req.params;
    const reviews = await Review.find({ brokerName }).sort({ createdAt: -1 }).lean();
    res.json({ data: reviews });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Test DB
app.get('/test-db', async (req, res) => {
  try {
    const count = await Property.countDocuments();
    res.json({ connected: true, totalProperties: count });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Home
app.get('/', (req, res) => {
  res.send('Real Estate API is running!');
});

// =============================
// 4. BROKER ENDPOINTS (USING fullName)
// =============================

// Broker: Register
app.post('/api/broker/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, license, agency, profileImageUrl } = req.body;
    const existing = await Broker.findOne({
      $or: [{ email }, { fullName }]
    });
    if (existing) return res.status(400).json({ message: 'Email or Full Name already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const broker = new Broker({
      email, password: hashedPassword, fullName, phone, license, agency,
      profileImageUrl: profileImageUrl || ''
    });
    await broker.save();
    res.status(201).json({ message: 'Broker registered', broker: { ...broker.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Login
app.post('/api/broker/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const broker = await Broker.findOne({ email });
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    const isMatch = await bcrypt.compare(password, broker.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ message: 'Login successful', broker: { ...broker.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Log Profile View (from user app) — uses fullName
app.post('/api/broker/log-view', async (req, res) => {
  try {
    const { viewedBrokerName, viewerInfo ,viewerPhone} = req.body;
    if (!viewedBrokerName || !viewerInfo) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const brokerExists = await Broker.findOne({ fullName: viewedBrokerName });
    if (!brokerExists) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    const view = new ProfileView({ viewedBrokerName, viewerInfo,viewerPhone });
    await view.save();

    res.status(201).json({ message: 'View logged', view });
  } catch (err) {
    console.error('Log view error:', err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Get Views (for broker app) — uses fullName
app.get('/api/broker/views/:fullName', async (req, res) => {
  try {
    const { fullName } = req.params;
    const views = await ProfileView.find({ viewedBrokerName: fullName })
      .sort({ timestamp: -1 })
      .lean();
    res.json({ data: views, count: views.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Status
app.get('/api/broker/status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const broker = await Broker.findOne({ email }).select('verificationStatus isSubscribed subscriptionEndDate -_id');
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    res.json(broker);
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Upload Documents
app.post('/api/broker/documents', upload.array('documents'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    const documents = req.files.map(file => ({
      brokerEmail: email,
      fileName: file.originalname,
      filePath: file.path,
    }));
    await Document.insertMany(documents);
    await Broker.findOneAndUpdate({ email }, { verificationStatus: 'pending' });
    res.status(201).json({ message: 'Documents uploaded. Verification pending.', files: documents });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Broker: Subscribe
app.post('/api/broker/subscribe', async (req, res) => {
  try {
    const { email, plan } = req.body;
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    const broker = await Broker.findOneAndUpdate(
      { email },
      { isSubscribed: true, subscriptionEndDate: endDate },
      { new: true }
    );
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    res.json({ message: 'Subscribed!', isSubscribed: true, subscriptionEndDate: endDate });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// =============================
// 5. START SERVER
// =============================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Go to http://localhost:${PORT}/seed to upload data (once)`);
});

