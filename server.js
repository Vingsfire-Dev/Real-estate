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
const http = require('http');
const { Server } = require('socket.io');
/* ------------------------------------------------------------------ */
/* --------------------------- CONFIG ------------------------------- */
const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI;

/* -------------------------- CONNECT ------------------------------- */
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB error:', err);
    process.exit(1);
  });

/* --------------------------- MODELS ------------------------------- */
const propertySchema = new mongoose.Schema({
  Name: String,
  PropertyTitle: String,
  Price: String,
  Location: String,
  TotalArea: Number,
  Baths: Number,
});
const Property = mongoose.model('Property', propertySchema);

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

/* --------------------- REVIEW SCHEMA --------------------- */
const reviewSchema = new mongoose.Schema({
  brokerName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model('Review', reviewSchema);

/* --------------------- BROKER SCHEMA --------------------- */
const brokerSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true, unique: true },
  phone: String,
  license: String,
  agency: String,
  profileImageUrl: String,
  verificationStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'verified', 'rejected'],
    default: 'not_submitted',
  },
  isSubscribed: { type: Boolean, default: false },
  subscriptionEndDate: Date,
});
const Broker = mongoose.model('Broker', brokerSchema);

/* --------------------- DOCUMENT & VIEW SCHEMAS --------------------- */
const documentSchema = new mongoose.Schema({
  brokerEmail: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});
const Document = mongoose.model('Document', documentSchema);

const profileViewSchema = new mongoose.Schema({
  viewedBrokerName: { type: String, required: true, index: true },
  viewerPhone: { type: String },
  viewerInfo: { type: String, required: true },
  estimatedBudget:  { type: Number },
  propertySummary: {
    name: { type: String },
    type: { type: String },
    area: { type: Number },
    baths: { type: Number },
    location: { type: String },
  },
  timestamp: { type: Date, default: Date.now },
});
const ProfileView = mongoose.model('ProfileView', profileViewSchema);
/* --------------------- NOTIFICATION SCHEMA --------------------- */
const notificationSchema = new mongoose.Schema({
  recipient: { type: String, required: true },  // e.g., "All Brokers", "All Premium Brokers", or broker email
  type: { type: String, enum: ['Manual', 'Automated'], required: true },
  channel: { type: String, enum: ['System', 'Email'], required: true },
  message: { type: String, required: true },
  dateTime: { type: Date, required: true },
  read: { type: Boolean, default: false },
  brokerEmail: { type: String, index: true }  // For personal; null for broadcasts
});
const Notification = mongoose.model('Notification', notificationSchema);


/* ----------------------- GLOBAL JSON TRANSFORM -------------------- */
mongoose.set('toJSON', {
  transform: (doc, ret) => {
    ret._id = ret._id.toString();
    if (ret.rating && ret.rating.$numberInt) ret.rating = parseInt(ret.rating.$numberInt, 10);
    if (ret.createdAt) ret.createdAt = new Date(ret.createdAt).toISOString();
    delete ret.__v;
    return ret;
  },
});

/* --------------------------- FILE UPLOAD -------------------------- */
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/documents';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const brokerEmail = req.body.email || 'unknown_broker';
    cb(null, `${brokerEmail}-${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage: documentStorage });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
/* --------------------- SOCKET.IO SETUP --------------------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const onlineBrokers = new Map();  // email -> socket.id

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  const email = socket.handshake.query.email;
  if (email) onlineBrokers.set(email, socket.id);

  socket.on('disconnect', () => {
    onlineBrokers.delete(email);
    console.log('Socket disconnected:', socket.id);
  });
});
/* ------------------------------ ROUTES --------------------------- */
app.get('/seed', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'real_estate_data.json');
    if (!fs.existsSync(filePath)) return res.status(404).send('real_estate_data.json missing');
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
    res.send(`Seeded ${docs.length} properties`);
  } catch (e) {
    res.status(500).send('Seed error: ' + e.message);
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const all = await Property.find().lean();
    if (!all.length) return res.json({ data: [], message: 'Run /seed' });
    res.json({ data: all });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

/* -------------------------- USER ENDPOINTS ---------------------- */
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, city, state, zip } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hash, firstName, lastName, phone, address, city, state, zip });
    await user.save();
    const safe = user.toObject(); delete safe.password;
    res.json({ message: 'User created', user: safe });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid password' });
    const safe = user.toObject(); delete safe.password;
    res.json({ message: 'Login OK', user: safe });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.put('/api/users', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, address, city, state, zip } = req.body;
    const user = await User.findOneAndUpdate(
      { email },
      { firstName, lastName, phone, address, city, state, zip },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    const safe = user.toObject(); delete safe.password;
    res.json({ message: 'User updated', user: safe });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

/* -------------------------- REVIEW ENDPOINTS ---------------------- */
app.post('/api/reviews', async (req, res) => {
  try {
    console.log('RAW BODY RECEIVED:', req.body);
    const { brokerName, rating, feedback } = req.body;
    if (!brokerName || rating === undefined) {
      return res.status(400).json({ message: 'Missing required fields', received: req.body });
    }
    const review = new Review({ brokerName, rating, feedback });
    await review.save();
    console.log('NEW REVIEW saved:', review.toObject());
    res.json({ message: 'Review submitted', review: review.toObject() });
  } catch (e) {
    console.error('POST /api/reviews error:', e);
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

/* GET reviews for a **specific broker** only */
app.get('/api/reviews/:brokerName', async (req, res) => {
  try {
    const { brokerName } = req.params;
    const reviews = await Review.find({ brokerName })
      .lean()
      .sort({ createdAt: -1 });

    const cleaned = reviews.map(r => ({
      _id: r._id.toString(),
      brokerName: r.brokerName,
      rating: Number(r.rating),
      feedback: r.feedback,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    console.log(`GET /api/reviews/${brokerName} → ${reviews.length} reviews`);
    res.json({ data: cleaned });
  } catch (e) {
    console.error('GET /api/reviews/:brokerName error:', e);
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

/* -------------------------- BROKER ENDPOINTS ---------------------- */
app.post('/api/broker/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, license, agency, profileImageUrl } = req.body;
    const exists = await Broker.findOne({ $or: [{ email }, { fullName }] });
    if (exists) return res.status(400).json({ message: 'Email/FullName taken' });
    const hash = await bcrypt.hash(password, 10);
    const broker = new Broker({ email, password: hash, fullName, phone, license, agency, profileImageUrl: profileImageUrl || '' });
    await broker.save();
    const safe = broker.toObject(); delete safe.password;
    res.status(201).json({ message: 'Broker registered', broker: safe });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});


app.post('/api/broker/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const broker = await Broker.findOne({ email });
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    const ok = await bcrypt.compare(password, broker.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const safe = broker.toObject(); delete safe.password;
    res.json({ message: 'Login OK', broker: safe });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.post('/api/broker/log-view', async (req, res) => {
  try {
    const { viewedBrokerName, viewerInfo, viewerPhone, estimatedBudget, propertySummary} = req.body;
    if (!viewedBrokerName || !viewerInfo) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const broker = await Broker.findOne({ fullName: viewedBrokerName });
    if (!broker) return res.status(404).json({ message: 'Broker not found' });

    const view = new ProfileView({
      viewedBrokerName,
      viewerInfo,
      viewerPhone: viewerPhone || '',
      estimatedBudget: estimatedBudget ? Number(estimatedBudget) : undefined,
      propertySummary,
    });
    await view.save();

    res.status(201).json({ message: 'View logged', view: view.toObject() });
  } catch (e) {
    console.error('log-view error:', e);
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.get('/api/broker/views/:fullName', async (req, res) => {
  try {
    const { fullName } = req.params;
    const views = await ProfileView.find({ viewedBrokerName: fullName })
      .lean()
      .sort({ timestamp: -1 });
    res.json({
      data: views.map(v => ({
        ...v,
        _id: v._id.toString(),
        timestamp: new Date(v.timestamp).toISOString(),
      })),
      count: views.length,
    });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.get('/api/broker/status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const broker = await Broker.findOne({ email })
      .select('verificationStatus isSubscribed subscriptionEndDate -_id')
      .lean();
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    res.json(broker);
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.post('/api/broker/documents', upload.array('documents'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!req.files?.length) return res.status(400).json({ message: 'No files' });
    const docs = req.files.map(f => ({
      brokerEmail: email,
      fileName: f.originalname,
      filePath: f.path,
    }));
    await Document.insertMany(docs);
    await Broker.findOneAndUpdate({ email }, { verificationStatus: 'pending' });
    res.status(201).json({ message: 'Docs uploaded – pending verification', files: docs });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

app.post('/api/broker/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    const end = new Date(); end.setFullYear(end.getFullYear() + 1);
    const broker = await Broker.findOneAndUpdate(
      { email },
      { isSubscribed: true, subscriptionEndDate: end },
      { new: true }
    );
    if (!broker) return res.status(404).json({ message: 'Broker not found' });
    res.json({ message: 'Subscribed', isSubscribed: true, subscriptionEndDate: end });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});
/* --------------------- NOTIFICATION ENDPOINTS --------------------- */
// CREATE (for admin/manual; add auth later if needed)
app.post('/api/notifications', async (req, res) => {
  try {
    const { recipient, type, channel, message, dateTime } = req.body;
    if (!recipient || !type || !channel || !message || !dateTime) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    const parsedDate = new Date(dateTime);  // Parse string to Date
    if (isNaN(parsedDate)) return res.status(400).json({ message: 'Invalid dateTime' });

    const notif = new Notification({
      recipient,
      type,
      channel,
      message,
      dateTime: parsedDate,
      brokerEmail: recipient.includes('@') ? recipient : null  // Personal if email
    });
    await notif.save();

    // Real-time emit
    const notifObj = notif.toObject();
    notifObj._id = notifObj._id.toString();
    notifObj.dateTime = notifObj.dateTime.toISOString();

    if (recipient === 'All Brokers' || recipient === 'All Premium Brokers') {
      // Broadcast to all online (or filter premium if needed)
      const brokers = recipient === 'All Premium Brokers' 
        ? await Broker.find({ isSubscribed: true }).select('email')
        : await Broker.find().select('email');
      brokers.forEach(b => {
        const sid = onlineBrokers.get(b.email);
        if (sid) io.to(sid).emit('new_notification', notifObj);
      });
    } else if (recipient.includes('@')) {
      const sid = onlineBrokers.get(recipient);
      if (sid) io.to(sid).emit('new_notification', notifObj);
    }

    res.status(201).json({ message: 'Notification created', data: notifObj });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

// GET for a broker (personal + broadcasts)
app.get('/api/notifications/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const notifications = await Notification.find({
      $or: [
        { brokerEmail: email },
        { recipient: { $in: ['All Brokers', 'All Premium Brokers'] } }  // Show all broadcasts; filter premium client-side if needed
      ]
    }).sort({ dateTime: -1 }).lean();

    const cleaned = notifications.map(n => ({
      ...n,
      _id: n._id.toString(),
      dateTime: n.dateTime.toISOString()
    }));

    res.json({ data: cleaned });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

// MARK AS READ
app.patch('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findByIdAndUpdate(id, { read: true }, { new: true }).lean();
    if (!notif) return res.status(404).json({ message: 'Not found' });
    const cleaned = { ...notif, _id: notif._id.toString(), dateTime: notif.dateTime.toISOString() };
    res.json({ message: 'Marked as read', data: cleaned });
  } catch (e) {
    res.status(500).json({ message: 'Server error', details: e.message });
  }
});

/* -------------------------- TEST ENDPOINT -------------------------- */
app.get('/test-db', async (req, res) => {
  try {
    const cnt = await Property.countDocuments();
    res.json({ connected: true, totalProperties: cnt });
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});

app.get('/', (req, res) => res.send('Real Estate API running'));

/* -------------------------- START SERVER -------------------------- */
server.listen(PORT, '0.0.0.0', err => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
