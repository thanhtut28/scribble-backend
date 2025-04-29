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
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzdkODJmNS0zNmFiLTQ1NGItYWQyMC1mY2VkMTExNjdiMjYiLCJlbWFpbCI6InRoYUB0aGEuY29tIiwiaWF0IjoxNzQ1ODUxODgyLCJleHAiOjE3NDU4NTI3ODJ9.OvmfaCVONZaVTUya7JKn4ksrvDMX-v4tbPXw5jQmktU';

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
setTimeout(() => {
  console.log('Creating a room...');
  socket.emit(
    'createRoom',
    {
      name: 'Test Room',
      maxPlayers: 4,
      rounds: 5,
    },
    (response) => {
      if (response.error) {
        console.error('Error creating room:', response.error);
      } else {
        console.log('Room created successfully:', response);
      }
    },
  );
}, 2000);

// Example: Get all rooms after 4 seconds
setTimeout(() => {
  console.log('Getting all rooms...');
  socket.emit('getRooms', (response) => {
    if (response.error) {
      console.error('Error getting rooms:', response.error);
    } else {
      console.log('All rooms:', response);
    }
  });
}, 4000);

// Keep the connection alive
process.on('SIGINT', () => {
  console.log('Disconnecting...');
  socket.disconnect();
  process.exit(0);
});
