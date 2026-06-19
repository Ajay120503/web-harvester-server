require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/harvester');
    
    const existing = await User.findOne({ email: 'ajaykandhare12@gmail.com' });
    if (existing) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    const admin = new User({
      fullName: 'Penetration Test Admin',
      email: 'ajaykandhare12@gmail.com',
      password: 'ajay@#1205',
      role: 'admin'
    });
    await admin.save();
    
    console.log('Admin user created successfully');
    console.log('Email: ajaykandhare12@gmail.com');
    console.log('Password: ajay@#1205');
    
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();