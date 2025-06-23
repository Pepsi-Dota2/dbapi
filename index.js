require('dotenv').config();  // โหลด .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');

// App and Server Setup
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Import Routes (รวมถึง initSocket จาก auth)
const { router: authRoutes, initSocket } = require('./routes/auth');
const buRoutes = require('./routes/bu');
const chanelRoutes = require('./routes/chanel');
const AllRoutes = require('./routes/overall');
const costRoutes = require('./routes/cost');
const promotionRoutes = require('./routes/promotion');
const bcgRoute = require('./routes/bcg');
// Mount Routes
app.use('/api', authRoutes);
app.use('/api/all', AllRoutes);
app.use('/api/bu', buRoutes);
app.use('/api/cost', costRoutes);
app.use('/api/channel', chanelRoutes);
app.use('/api/promotion', promotionRoutes);
app.use('/api/bcg', bcgRoute);
// POS SALE RETAIL Routes
const authposRoutes = require('./routes/pos/autpos');
const customerRoutes = require('./routes/pos/poscustomer');
const warehouseRoutes = require('./routes/pos/warehouse');
const posRoutes = require('./routes/pos/transection');
app.use('/pos', authposRoutes);
app.use('/pos', customerRoutes);
app.use('/pos', warehouseRoutes);
app.use('/pos', posRoutes);

// Hello Test Route
const authodsRoutes = require('./routes/ods/auth');
app.use('/api/ods', authodsRoutes);
// ODS API Test Route






app.get('/api/hello', (req, res) => {
  res.json({ message: 'ສະບາຍດີຈາກ API 🚀' });
});

// Initialize Socket.IO Realtime (AFTER all routes setup)
initSocket(io);

// Start Server with HTTP + Socket.IO
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
