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

// Seed Route (Run Once)
app.get('/seed', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'real_estate_data.json');
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

    await Property.deleteMany({});
    await Property.insertMany(docs);
    res.send('Data uploaded to MongoDB!');
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// API: Get All Products
app.get('/api/products', async (req, res) => {
  try {
    const all = await Property.find().lean();
    const result = all.map(p => ({
      Name: p.Name,
      PropertyTitle: p.PropertyTitle,
      Price: p.Price,
      Location: p.Location,
      TotalArea: p.TotalArea,
      Baths: p.Baths,
    }));
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
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