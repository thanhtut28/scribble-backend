/**
 * Simple WebSocket client example for testing the Scribble Game WebSocket API
 *
 * Usage:
 * 1. Make sure you have a valid JWT token
 * 2. Update the token variable below with your token
 * 3. Run this script with Node.js: node websocket-client.js
 */

const { io } = require('socket.io-client');

// Replace with your JWT token
const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiM2U3MDk1MS05N2ExLTQyNjMtYTEwOC1hOTE2MDk5ZmRjOWEiLCJlbWFpbCI6ImJlcnJ5QGJlcnJ5LmNvbSIsImlhdCI6MTc0NjIwNDAyMCwiZXhwIjoxNzQ2MjkwNDIwfQ.qa7GoCqNNsd7SSgLC8agmRqX9Br55GTvOVspn-yxm8Y';

// Connect to the WebSocket server
const socket = io('ws://localhost:4000/rooms', {
  transports: ['websocket'],
  auth: { token },
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to server!');
});

socket.on('error', (error) => {
  console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connected', (data) => {
  console.log('Connection acknowledged:', data);
});

// Room events
socket.on('rooms', (rooms) => {
  console.log('Available rooms:', rooms);
});

socket.on('roomCreated', (room) => {
  console.log('Room created:', room);
});

socket.on('userJoined', (data) => {
  console.log(`User ${data.userId} joined room:`, data.room);
});

socket.on('userLeft', (data) => {
  console.log(`User ${data.userId} left room:`, data.room);
});

// Example: Create a room after 2 seconds
// setTimeout(() => {
//   console.log('Creating a room...');
//   socket.emit(
//     'createRoom',
//     {
//       name: 'Test Room 3',
//       maxPlayers: 8,
//       rounds: 4,
//     },
//     (response) => {
//       if (response.error) {
//         console.error('Error creating room:', response.error);
//       } else {
//         console.log('Room created successfully:', response);
//       }
//     },
//   );
// }, 2000);

setTimeout(() => {
  console.log('Joining room...');
  socket.emit(
    'joinRoom',
    { roomId: '148babbc-536c-4a1b-b94d-1bb862cc3a9a' },
    (response) => {
      console.log('Joined room:', response);
    },
  );
}, 2000);

// Example: Get all rooms after 4 seconds
// setTimeout(() => {
//   console.log('Getting all rooms...');
//   socket.emit('getRooms', (response) => {
//     if (response.error) {
//       console.error('Error getting rooms:', response.error);
//     } else {
//       console.log('All rooms:', response);
//     }
//   });
// }, 4000);

// Keep the connection alive
process.on('SIGINT', () => {
  console.log('Disconnecting...');
  socket.disconnect();
  process.exit(0);
});
