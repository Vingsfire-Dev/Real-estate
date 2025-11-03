require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

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
  password: { type: String, required: true }, // Hashed
  firstName: String,
  lastName: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
});
const User = mongoose.model('User', userSchema);
// Seed Route (Run Once) - USES YOUR JSON FILE
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

    await Property.insertMany(docs, { ordered: false }); // Add, ignore duplicates

    res.send(`Data added to MongoDB from JSON file! Loaded ${docs.length} properties.`);
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).send('Seed Error: ' + err.message);
  }
});
// NEW: Review Model 
const reviewSchema = new mongoose.Schema({
  brokerName: { type: String, required: true }, // e.g., "Skyline Realty"
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model('Review', reviewSchema);
// API: Get All Products - FROM DB (like your original, but from MongoDB)
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
    console.error('API error:', err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, city, state, zip } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10); // Hash password
    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      address,
      city,
      state,
      zip,
    });
    await user.save();
    res.json({ message: 'User created successfully', user: { ...user.toObject(), password: undefined } }); // Return without password
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    res.json({ message: 'Login successful', user: { ...user.toObject(), password: undefined } }); // Return without password
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Update User 
app.put('/api/users', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, address, city, state, zip } = req.body;
    const user = await User.findOneAndUpdate(
      { email },
      { firstName, lastName, phone, address, city, state, zip },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
app.post('/api/reviews', async (req, res) => {
  try {
    const { brokerName, rating, feedback } = req.body;
    const review = new Review({
      brokerName,
      rating,
      feedback,
    });
    await review.save();
    res.json({ message: 'Review submitted successfully', review });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// NEW: Get Reviews for Broker (GET)
app.get('/api/reviews/:brokerName', async (req, res) => {
  try {
    const { brokerName } = req.params;
    const reviews = await Review.find({ brokerName }).sort({ createdAt: -1 }).lean();
    res.json({ data: reviews });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Test DB Connection
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
const multer = require('multer');

// --- 1. NEW SCHEMAS FOR BROKER DATA ---

// Broker Model: For data from broker_register_page.dart and other pages.
// ──────────────────────────────────────────────────────────────
// 1. Broker model – add unique fullName
// ──────────────────────────────────────────────────────────────
const brokerSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true, unique: true },   // <-- NEW
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

// Document Model: For files from file_upload_page.dart
const documentSchema = new mongoose.Schema({
  brokerEmail: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true }, // Path to the file on the server
  uploadedAt: { type: Date, default: Date.now },
});
const Document = mongoose.model('Document', documentSchema);

// ProfileView Model: For tracking profile views in home.dart
const profileViewSchema = new mongoose.Schema({
    viewedBrokerEmail: { type: String, required: true, index: true },
    viewerInfo: { type: String, required: true }, // Can store viewer email or general info
    timestamp: { type: Date, default: Date.now }
});
const ProfileView = mongoose.model('ProfileView', profileViewSchema);


// --- 2. FILE UPLOAD CONFIGURATION (using Multer) ---

// Configure storage for verification documents
const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/documents';
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Create a unique filename to prevent conflicts
        const brokerEmail = req.body.email || 'unknown_broker';
        cb(null, `${brokerEmail}-${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: documentStorage });

// To serve uploaded files statically (so they can be viewed/downloaded)
// Example URL: http://your-server.com/uploads/documents/your-file.pdf
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- 3. NEW API ENDPOINTS FOR BROKERS ---

// Endpoint for Broker Registration (from broker_register_page.dart)
app.post('/api/broker/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, license, agency, profileImageUrl } = req.body;
    const existingBroker = await Broker.findOne({ email });
    if (existingBroker) {
      return res.status(400).json({ message: 'Broker with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const broker = new Broker({
      email,
      password: hashedPassword,
      fullName,
      phone,
      license,
      agency,
      profileImageUrl: profileImageUrl || '',
    });
    await broker.save();
    // Return broker data without the password
    res.status(201).json({ message: 'Broker registered successfully', broker: { ...broker.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error during registration', details: err.message });
  }
});

// Endpoint for Broker Login (from login_checker_page.dart)
app.post('/api/broker/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const broker = await Broker.findOne({ email });
    if (!broker) {
      return res.status(404).json({ message: 'Broker not found' });
    }
    const isMatch = await bcrypt.compare(password, broker.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Return broker data without the password
    res.json({ message: 'Login successful', broker: { ...broker.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login', details: err.message });
  }
});

// Endpoint to log a profile view (called from user app)
app.post('/api/broker/log-view', async (req, res) => {
  try {
    const { viewedBrokerEmail, viewerInfo } = req.body;

    if (!viewedBrokerEmail || !viewerInfo) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Optional: Check if broker exists
    const brokerExists = await Broker.findOne({ email: viewedBrokerEmail });
    if (!brokerExists) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    const view = new ProfileView({
      viewedBrokerEmail,
      viewerInfo,
    });

    await view.save();

    res.status(201).json({ message: 'View logged successfully', view });
  } catch (err) {
    console.error('Log view error:', err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Endpoint to get broker status (verification & subscription)
app.get('/api/broker/status/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const broker = await Broker.findOne({ email }).select('verificationStatus isSubscribed subscriptionEndDate -_id');
        if (!broker) {
            return res.status(404).json({ message: 'Broker not found' });
        }
        res.json(broker);
    } catch (err) {
        res.status(500).json({ message: 'Server error', details: err.message });
    }
});

// Endpoint for uploading verification documents (from file_upload_page.dart)
// This uses 'upload.array("documents")' to handle multiple files in a field named "documents"
app.post('/api/broker/documents', upload.array('documents'), async (req, res) => {
    try {
        const { email } = req.body; // The broker's email should be sent with the files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files were uploaded.' });
        }

        // Create a record for each uploaded file
        const documents = req.files.map(file => ({
            brokerEmail: email,
            fileName: file.originalname,
            filePath: file.path,
        }));

        await Document.insertMany(documents);

        // After files are saved, update broker status to 'pending'
        await Broker.findOneAndUpdate({ email }, { verificationStatus: 'pending' });

        res.status(201).json({ 
            message: 'Documents uploaded successfully. Verification is now pending.', 
            files: documents 
        });

    } catch (err) {
        res.status(500).json({ message: 'Server error during file upload.', details: err.message });
    }
});

// Endpoint to update subscription status (from payment_page.dart)
app.post('/api/broker/subscribe', async (req, res) => {
    try {
        const { email, plan } = req.body; // Plan could be 'standard' or 'premium'
        
        // For simplicity, we set the subscription to end one year from now
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);

        const broker = await Broker.findOneAndUpdate(
            { email },
            { isSubscribed: true, subscriptionEndDate },
            { new: true } // Return the updated document
        );

        if (!broker) {
            return res.status(404).json({ message: 'Broker not found' });
        }
        res.json({ 
            message: 'Subscription successful!', 
            isSubscribed: broker.isSubscribed, 
            subscriptionEndDate: broker.subscriptionEndDate 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', details: err.message });
    }
});

// Endpoint to get all views for a broker's profile (for home.dart)
app.get('/api/broker/views/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const views = await ProfileView.find({ viewedBrokerEmail: email })
            .sort({ timestamp: -1 }) // Sort by most recent
            .lean(); 
        res.json({ data: views, count: views.length });
    } catch (err) {
        res.status(500).json({ message: 'Server error', details: err.message });
    }
});


// --------------------------------------------------------------
// --- END: BROKER APPLICATION BACKEND ---
// --------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Go to http://localhost:${PORT}/seed to upload data (do this once)`);
});


