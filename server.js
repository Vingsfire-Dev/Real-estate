require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Go to http://localhost:${PORT}/seed to upload data (do this once)`);
});
