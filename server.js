const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const gameRooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
    let roomCode = null;
    let playerId = uuidv4();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'create_room':
                roomCode = generateRoomCode();
                gameRooms.set(roomCode, {
                    players: [{ id: playerId, ws }],
                    scores: [0, 0]
                });
                ws.send(JSON.stringify({
                    type: 'room_created',
                    roomCode,
                    playerId
                }));
                break;

            case 'join_room':
                const room = gameRooms.get(data.roomCode.toUpperCase());
                if (!room) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Room not found'
                    }));
                    return;
                }

                if (room.players.length >= 2) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Room is full'
                    }));
                    return;
                }

                roomCode = data.roomCode.toUpperCase();
                room.players.push({ id: playerId, ws });

                ws.send(JSON.stringify({
                    type: 'join_confirmed',
                    roomCode: roomCode
                }));

                room.players.forEach((player, index) => {
                    player.ws.send(JSON.stringify({
                        type: 'game_start',
                        playerNumber: index + 1,
                        totalPlayers: room.players.length
                    }));
                });
                break;

            case 'paddle_move':
                const gameRoom = gameRooms.get(roomCode);
                if (!gameRoom) return;

                gameRoom.players.forEach(player => {
                    if (player.id !== playerId) {
                        player.ws.send(JSON.stringify({
                            type: 'opponent_move',
                            position: data.position
                        }));
                    }
                });
                break;

            case 'ball_update':
                const currentRoom = gameRooms.get(roomCode);
                if (!currentRoom) return;

                currentRoom.players.forEach(player => {
                    if (player.id !== playerId) {
                        player.ws.send(JSON.stringify({
                            type: 'ball_sync',
                            position: data.position,
                            direction: data.direction
                        }));
                    }
                });
                break;

            case 'score_update':
                const scoreRoom = gameRooms.get(roomCode);
                if (!scoreRoom) return;

                scoreRoom.scores = data.scores;
                scoreRoom.players.forEach(player => {
                    player.ws.send(JSON.stringify({
                        type: 'score_sync',
                        scores: data.scores
                    }));
                });
                break;
        }
    });

    ws.on('close', () => {
        if (roomCode && gameRooms.has(roomCode)) {
            const room = gameRooms.get(roomCode);

            room.players.forEach(player => {
                if (player.id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'player_disconnected'
                    }));
                }
            });

            gameRooms.delete(roomCode);
        }
    });
});

server.listen(8080, () => {
    console.log('Server running at http://localhost:8080');
});