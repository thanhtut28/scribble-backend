## Game Logic

We want to build a scribble game with react frontend and nestjs backend. The flow is simple, players can play multiplayer online with private room system where users can host and join (maximum players 8 people). In each game, there will be 8 rounds and 3 random words will be generated on each round. Each round, a random player will be chosen to pick a word from 3 words and will draw that word on the canvas. The remaining players will guess that word in the chat box and players who guess correct word will be scored according to the speed of the answer. After all rounds, the game ends and the winner will be declared according to the total score.

Note: This is backend project and we will neglect frontned, only build REST API

## Backend Tech Stack

- NestJS
- Prisma
- JWT Refresh and Access tokens authorizaion logic
- Socket.io

# Project Roadmap

Note: [ ] Todo, [X] Completed

- [x] Authentication with JWT
- [ ] User Management (profile, stats)
- [ ] Room System
  - [ ] Create/Join/Leave Room API
  - [ ] Room Settings (max players, rounds)
  - [ ] Player Management in Rooms
- [ ] Game Logic
  - [ ] Word Generation/Selection
  - [ ] Turn Management
  - [ ] Game State Management
  - [ ] Scoring System
- [ ] Real-time Communication
  - [ ] Socket.io Integration
  - [ ] Drawing Data Transmission
  - [ ] Chat System
  - [ ] Game Event Broadcasting
- [ ] Data Persistence
  - [ ] Game History
  - [ ] User Statistics
- [ ] Testing & Deployment
