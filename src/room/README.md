# Room System with WebSockets

This module implements a real-time room system for the Scribble Game using Socket.io WebSockets.

## Features

- Create, join, and leave rooms in real-time
- Room password protection
- Room limits (max players, rounds)
- Automatic owner reassignment when the owner leaves
- Real-time notifications for room events

## WebSocket Events

### Client to Server Events

| Event        | Description                    | Payload                                                                                          |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `createRoom` | Create a new room              | `{ name: string, maxPlayers?: number, rounds?: number, isPrivate?: boolean, password?: string }` |
| `joinRoom`   | Join an existing room          | `{ roomId: string, password?: string }`                                                          |
| `leaveRoom`  | Leave a room                   | `roomId: string`                                                                                 |
| `getRooms`   | Get all available rooms        | -                                                                                                |
| `getRoom`    | Get details of a specific room | `roomId: string`                                                                                 |

### Server to Client Events

| Event         | Description                | Payload                               |
| ------------- | -------------------------- | ------------------------------------- |
| `connected`   | Connection established     | `{ userId: string, message: string }` |
| `error`       | Error occurred             | `{ message: string }`                 |
| `rooms`       | List of available rooms    | `Room[]`                              |
| `roomCreated` | Room creation notification | `Room`                                |
| `userJoined`  | User joined a room         | `{ room: Room, userId: string }`      |
| `userLeft`    | User left a room           | `{ room: Room, userId: string }`      |

## Authentication

All WebSocket connections require a valid JWT token for authentication. The token can be provided in one of two ways:

1. In the connection handshake as an auth parameter:

```javascript
const socket = io('ws://localhost:4000/rooms', {
  auth: { token: 'YOUR_JWT_TOKEN' },
});
```

2. In the connection handshake as an authorization header:

```javascript
const socket = io('ws://localhost:4000/rooms', {
  extraHeaders: { Authorization: 'Bearer YOUR_JWT_TOKEN' },
});
```

## Connection Example

```javascript
const { io } = require('socket.io-client');

// Replace with your JWT token
const token = 'YOUR_JWT_TOKEN_HERE';

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

// Create a room
socket.emit(
  'createRoom',
  {
    name: 'My Game Room',
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
```

See the `examples/websocket-client.js` file for a more complete example.
