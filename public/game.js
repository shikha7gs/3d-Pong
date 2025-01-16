const hitNoise = new Audio('hit.mp3');
const epicWin = new Audio('win.mp3');
const rip = new Audio('lose.mp3');

class WebSocketClient {
    constructor(game) {
        this.game = game;
        this.ws = null;
        this.isHost = false;
        this.roomCode = null;
        this.connected = false;
    }

    connect() {
        this.ws = new WebSocket('wss://threed-pong.onrender.com/');

        this.ws.onopen = () => {
            this.connected = true;
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            this.connected = false;
            console.log('Disconnected from server');
            if (this.game.gameOn) {
                document.getElementById('disconnect-message').style.display = 'block';
            }
        };
    }

    handleMessage(data) {
        console.log('Received message:', data.type);
        switch (data.type) {
            case 'room_created':
                this.roomCode = data.roomCode;
                this.isHost = true;
                document.getElementById('room-code').textContent = this.roomCode;
                document.getElementById('room-code-display').style.display = 'block';
                document.getElementById('join-room-form').style.display = 'none';
                document.getElementById('waiting-message').style.display = 'block';
                break;

            case 'join_confirmed':
                console.log('Join confirmed, waiting for game start');
                this.roomCode = data.roomCode;
                this.isHost = false;
                document.getElementById('join-room-form').style.display = 'none';
                document.getElementById('waiting-message').textContent = 'Successfully joined! Game starting...';
                document.getElementById('waiting-message').style.display = 'block';
                break;

            case 'game_start':
                console.log('Game start received, player number:', data.playerNumber);
                this.game.isMultiplayer = true;
                this.game.playerNumber = data.playerNumber;

                this.game.startGame();

                if (data.playerNumber === 2) {
                    console.log('Setting up Player 2 view');
                    this.game.setupPlayer2Camera();
                }

                document.getElementById('multiplayer-menu').style.display = 'none';
                document.getElementById('home-screen').style.display = 'none';
                document.getElementById('game-screen').style.display = 'block';
                break;

            case 'opponent_move':
                if (this.game.gameOn) {
                    this.game.updateOpponentPaddle(data.position);
                }
                break;

            case 'ball_sync':
                if (!this.isHost && this.game.gameOn) {
                    this.game.syncBall(data.position, data.direction);
                }
                break;

            case 'score_sync':
                if (this.game.gameOn && this.game.syncScores) {
                    console.log('Syncing scores:', data.scores);
                    this.game.syncScores(data.scores);
                }
                break;

            case 'player_disconnected':
                document.getElementById('disconnect-message').style.display = 'block';
                break;

            case 'error':
                alert(data.message);
                break;
        }
    }

    createRoom() {
        if (this.connected) {
            this.ws.send(JSON.stringify({
                type: 'create_room'
            }));
        }
    }

    joinRoom(roomCode) {
        if (this.connected) {
            this.ws.send(JSON.stringify({
                type: 'join_room',
                roomCode: roomCode
            }));
        }
    }

    sendPaddlePosition(position) {
        if (this.connected && this.game.gameOn) {
            this.ws.send(JSON.stringify({
                type: 'paddle_move',
                position: position
            }));
        }
    }

    sendBallUpdate(position, direction) {
        if (this.connected && this.isHost && this.game.gameOn) {
            this.ws.send(JSON.stringify({
                type: 'ball_update',
                position: position,
                direction: direction
            }));
        }
    }

    sendScoreUpdate(scores) {
        if (this.connected && this.isHost && this.game.gameOn) {
            this.ws.send(JSON.stringify({
                type: 'score_update',
                scores: scores
            }));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

class PongGame {
    constructor() {
        this.initialized = false;
        this.wsClient = new WebSocketClient(this);
        this.isMultiplayer = false;
        this.invertControls = false;
        this.playerNumber = 1;
        this.setupMultiplayerMenu();

        this.syncScores = this.syncScores.bind(this);
        this.updateOpponentPaddle = this.updateOpponentPaddle.bind(this);
        this.syncBall = this.syncBall.bind(this);
    }

    syncScores(scores) {
        console.log('syncScores called with:', scores, 'Player:', this.playerNumber);
        
        if (this.playerNumber === 1) {
            this.myScore = scores[0];
            this.botScore = scores[1];
        } else {
            this.myScore = scores[1];
            this.botScore = scores[0];
        }

        document.getElementById('player-score').textContent = `You: ${this.myScore}`;
        document.getElementById('ai-score').textContent = `Opponent: ${this.botScore}`;

        if (this.myScore >= this.maxScore || this.botScore >= this.maxScore) {
            this.gameOver();
        }
    }

    setupMultiplayerMenu() {
        document.getElementById('bot-button').addEventListener('click', () => {
            this.isMultiplayer = false;
            this.startGame();
        });

        document.getElementById('multiplayer-button').addEventListener('click', () => {
            this.isMultiplayer = true;
            document.getElementById('home-screen').style.display = 'none';
            document.getElementById('multiplayer-menu').style.display = 'flex';
            this.wsClient.connect();
        });

        document.getElementById('create-room').addEventListener('click', () => {
            this.wsClient.createRoom();
        });

        document.getElementById('join-room').addEventListener('click', () => {
            document.getElementById('join-room-form').style.display = 'block';
        });

        document.getElementById('submit-code').addEventListener('click', () => {
            const code = document.getElementById('room-code-input').value.toUpperCase();
            this.wsClient.joinRoom(code);
        });

        document.getElementById('back-button').addEventListener('click', () => {
            document.getElementById('multiplayer-menu').style.display = 'none';
            document.getElementById('home-screen').style.display = 'flex';
            this.wsClient.close();
        });

        document.getElementById('return-to-menu').addEventListener('click', () => {
            location.reload();
        });
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('game-screen').appendChild(this.renderer.domElement);

        this.gameOn = true;
        this.myScore = 0;
        this.botScore = 0;
        this.maxScore = 5;
        this.gamePaused = false;
        this.countdown = 3;
        this.invertControls = false;

        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isTouching = false;
        this.touchSensitivity = 1.5;
        this.aspectRatio = window.innerWidth / window.innerHeight;
        this.updateGameDimensions();

        this.arenaWidth = 12;
        this.arenaHeight = 9;
        this.arenaDepth = 20;
        this.paddleWidth = 3;
        this.paddleHeight = 2.5;
        this.paddleThicc = 0.1;
        this.ballSize = 0.5;
        this.ballSpeed = 0.35;
        this.ballDir = new THREE.Vector3(1, 0.3, 1).normalize();
        this.spinnySpeed = 0.1;

        this.makeLights();
        this.makeArena();
        this.makePaddles();
        this.makeBall();
        this.setupCamera();
        this.setupControls();
        this.setupEvents();
        
        if (!this.isMultiplayer) {
            this.startCountdown();
        }
        this.animate();
    }

    setupPlayer2Camera() {
        console.log('Setting up Player 2 camera');
        this.camera.position.set(0, 2, this.arenaDepth / 2 + 10);
        this.camera.lookAt(0, 2, -this.arenaDepth);
        const tempZ = this.myPaddle.position.z;
        this.myPaddle.position.z = this.botPaddle.position.z;
        this.botPaddle.position.z = tempZ;
        this.invertControls = true;
        console.log('Player 2 camera setup complete');
    }

    makeLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(0, 20, 0);
        this.scene.add(pointLight);
    }

    makeArena() {
        const arenaBox = new THREE.BoxGeometry(this.arenaWidth, this.arenaHeight, this.arenaDepth);
        const arenaMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: false,
            opacity: 0.1,
            transparent: true
        });
        this.arena = new THREE.Mesh(arenaBox, arenaMaterial);
        this.scene.add(this.arena);

        const edges = new THREE.EdgesGeometry(arenaBox);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        const arenaLines = new THREE.LineSegments(edges, lineMaterial);
        this.scene.add(arenaLines);
    }

    makePaddles() {
        const paddleBox = new THREE.BoxGeometry(
            this.paddleWidth,
            this.paddleHeight,
            this.paddleThicc
        );
        const paddleStyle = new THREE.MeshPhongMaterial({ color: 0xffffff });

        this.myPaddle = new THREE.Mesh(paddleBox, paddleStyle);
        this.myPaddle.position.set(0, 0, -this.arenaDepth / 2 + 1);
        this.scene.add(this.myPaddle);

        this.botPaddle = new THREE.Mesh(paddleBox, paddleStyle);
        this.botPaddle.position.set(0, 0, this.arenaDepth / 2 - 1);
        this.scene.add(this.botPaddle);
    }

    makeBall() {
        const ballShape = new THREE.SphereGeometry(this.ballSize);
        const ballStyle = new THREE.MeshPhongMaterial({
            color: 0xff4444,
            emissive: 0x441111,
            shininess: 100
        });
        this.ball = new THREE.Mesh(ballShape, ballStyle);
        this.ball.castShadow = true;
        this.resetBall();
        this.scene.add(this.ball);

        this.ballGlow = new THREE.PointLight(0xff6666, 1, 10);
        this.ball.add(this.ballGlow);
    }

    setupCamera() {
        this.camera.position.set(0, 2, -this.arenaDepth / 2 - 10);
        this.camera.lookAt(0, 2, this.arenaDepth);
        this.cameraOffset = new THREE.Vector3(0, 2, 0);
        this.cameraLerpFactor = 0.1;
    }

    setupControls() {
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };
    }

    startGame() {
        console.log('Starting game, multiplayer:', this.isMultiplayer);
        document.getElementById('home-screen').style.display = 'none';
        document.getElementById('multiplayer-menu').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        
        if (!this.initialized) {
            this.init();
        }
        
        this.myScore = 0;
        this.botScore = 0;
        this.updateScore();
        
        this.startCountdown();
    }

    updateGameDimensions() {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isMobile = screenWidth < 768;

        if (isMobile) {
            this.arenaWidth = 6;
            this.arenaHeight = 8;
            this.arenaDepth = 14;
            this.paddleWidth = 1.8;
            this.paddleHeight = 2;
            this.ballSize = 0.35;
            this.ballSpeed = 0.25;
            this.touchSensitivity = 2.5;
        } else {
            this.arenaWidth = 12;
            this.arenaHeight = 9;
            this.arenaDepth = 20;
            this.paddleWidth = 3;
            this.paddleHeight = 2.5;
            this.ballSize = 0.5;
            this.ballSpeed = 0.35;
            this.touchSensitivity = 1.5;
        }
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => this.keyPressed(e));
        window.addEventListener('keyup', (e) => this.keyReleased(e));

        this.renderer.domElement.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.renderer.domElement.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.renderer.domElement.addEventListener('touchend', () => this.handleTouchEnd());

        window.addEventListener('resize', () => this.handleResize());
        document.getElementById('restart-button').addEventListener('click', () => this.restartGame());
    }

    handleTouchStart(event) {
        event.preventDefault();
        const touch = event.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.isTouching = true;
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.isTouching) return;

        const touch = event.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;

        const moveSpeed = 0.02 * this.touchSensitivity;
        const invertFactor = this.invertControls ? -1 : 1;

        if (deltaX > 0 && this.myPaddle.position.x > -this.arenaWidth / 2 + this.paddleWidth / 2) {
            this.myPaddle.position.x -= Math.abs(deltaX) * moveSpeed * invertFactor;
        }
        if (deltaX < 0 && this.myPaddle.position.x < this.arenaWidth / 2 - this.paddleWidth / 2) {
            this.myPaddle.position.x += Math.abs(deltaX) * moveSpeed * invertFactor;
        }
        if (deltaY < 0 && this.myPaddle.position.y < this.arenaHeight / 2 - this.paddleHeight / 2) {
            this.myPaddle.position.y += Math.abs(deltaY) * moveSpeed;
        }
        if (deltaY > 0 && this.myPaddle.position.y > -this.arenaHeight / 2 + this.paddleHeight / 2) {
            this.myPaddle.position.y -= Math.abs(deltaY) * moveSpeed;
        }

        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;

        if (this.isMultiplayer) {
            this.wsClient.sendPaddlePosition({
                x: this.myPaddle.position.x,
                y: this.myPaddle.position.y
            });
        }
    }

    handleTouchEnd() {
        this.isTouching = false;
    }

    keyPressed(event) {
        switch (event.key) {
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'ArrowUp':
                this.keys.up = true;
                break;
            case 'ArrowDown':
                this.keys.down = true;
                break;
        }
    }

    keyReleased(event) {
        switch (event.key) {
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'ArrowUp':
                this.keys.up = false;
                break;
            case 'ArrowDown':
                this.keys.down = false;
                break;
        }
    }

    handleResize() {
        this.aspectRatio = window.innerWidth / window.innerHeight;
        this.camera.aspect = this.aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.updateGameDimensions();

        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            this.camera.position.set(0, 2, -this.arenaDepth / 2 - 8);
            this.camera.lookAt(0, 2, this.arenaDepth);
        } else {
            this.camera.position.set(0, 2, -this.arenaDepth / 2 - 10);
            this.camera.lookAt(0, 2, this.arenaDepth);
        }
    }

    updateMyPaddle() {
        const moveSpeed = 0.3;
        const oldPosition = this.myPaddle.position.clone();

        const invertLeftRight = this.playerNumber === 2;
        const right = invertLeftRight ? this.keys.left : this.keys.right;
        const left = invertLeftRight ? this.keys.right : this.keys.left;

        if (right && this.myPaddle.position.x > -this.arenaWidth / 2 + this.paddleWidth / 2) {
            this.myPaddle.position.x -= moveSpeed;
        }
        if (left && this.myPaddle.position.x < this.arenaWidth / 2 - this.paddleWidth / 2) {
            this.myPaddle.position.x += moveSpeed;
        }
        if (this.keys.up && this.myPaddle.position.y < this.arenaHeight / 2 - this.paddleHeight / 2) {
            this.myPaddle.position.y += moveSpeed;
        }
        if (this.keys.down && this.myPaddle.position.y > -this.arenaHeight / 2 + this.paddleHeight / 2) {
            this.myPaddle.position.y -= moveSpeed;
        }

        if (this.isMultiplayer && !oldPosition.equals(this.myPaddle.position)) {
            this.wsClient.sendPaddlePosition({
                x: this.myPaddle.position.x,
                y: this.myPaddle.position.y
            });
        }
    }

    updateBotPaddle() {
        if (this.isMultiplayer) return;          
        const botSpeed = 0.2;
        const botError = 0.2;
        const prediction = 1.2;

        const whereToX = this.ball.position.x + this.ballDir.x * prediction;
        const whereToY = this.ball.position.y + this.ballDir.y * prediction;

        const smoothX = THREE.MathUtils.lerp(
            this.botPaddle.position.x,
            whereToX + (Math.random() - 0.5) * botError,
            0.1
        );

        const smoothY = THREE.MathUtils.lerp(
            this.botPaddle.position.y,
            whereToY + (Math.random() - 0.5) * botError,
            0.1
        );

        if (smoothX > this.botPaddle.position.x &&
            this.botPaddle.position.x < this.arenaWidth / 2 - this.paddleWidth / 2) {
            this.botPaddle.position.x += botSpeed;
        }
        if (smoothX < this.botPaddle.position.x &&
            this.botPaddle.position.x > -this.arenaWidth / 2 + this.paddleWidth / 2) {
            this.botPaddle.position.x -= botSpeed;
        }
        if (smoothY > this.botPaddle.position.y &&
            this.botPaddle.position.y < this.arenaHeight / 2 - this.paddleHeight / 2) {
            this.botPaddle.position.y += botSpeed;
        }
        if (smoothY < this.botPaddle.position.y &&
            this.botPaddle.position.y > -this.arenaHeight / 2 + this.paddleHeight / 2) {
            this.botPaddle.position.y -= botSpeed;
        }
    }

    updateOpponentPaddle(position) {
        this.botPaddle.position.x = position.x;
        this.botPaddle.position.y = position.y;
    }

    syncBall(position, direction) {
        this.ball.position.set(position.x, position.y, position.z);
        this.ballDir.set(direction.x, direction.y, direction.z);
    }

    checkPaddleHit(paddle) {
        const paddleBox = new THREE.Box3().setFromObject(paddle);
        const ballBox = new THREE.Box3().setFromObject(this.ball);

        if (paddleBox.intersectsBox(ballBox)) {
            hitNoise.play();

            const hitX = (this.ball.position.x - paddle.position.x) / (this.paddleWidth / 2);
            const hitY = (this.ball.position.y - paddle.position.y) / (this.paddleHeight / 2);

            this.ballDir.z *= -1;
            this.ballDir.x = hitX * 0.75;
            this.ballDir.y = hitY * 0.75;
            this.ballDir.normalize();
        }
    }

    updateBall() {
        if (this.gamePaused) return;

        this.ball.rotation.x += this.spinnySpeed;
        this.ball.rotation.y += this.spinnySpeed;

        if (this.isMultiplayer && !this.wsClient.isHost) {
            const predictedMovement = this.ballDir.clone().multiplyScalar(this.ballSpeed * 0.5);
            this.ball.position.add(predictedMovement);
        } else {
            const movement = this.ballDir.clone().multiplyScalar(this.ballSpeed);
            this.ball.position.add(movement);

            if (Math.abs(this.ball.position.x) > this.arenaWidth / 2 - this.ballSize) {
                this.ballDir.x *= -0.8;
                this.ball.position.x = Math.sign(this.ball.position.x) * (this.arenaWidth / 2 - this.ballSize);
            }
            if (Math.abs(this.ball.position.y) > this.arenaHeight / 2 - this.ballSize) {
                this.ballDir.y *= -0.8;
                this.ball.position.y = Math.sign(this.ball.position.y) * (this.arenaHeight / 2 - this.ballSize);
                this.spinnySpeed = (Math.random() - 0.5) * 0.1;
            }

            if (!this.isMultiplayer || this.wsClient.isHost) {
                this.checkPaddleHit(this.myPaddle);
                this.checkPaddleHit(this.botPaddle);

                if (this.ball.position.z < -this.arenaDepth / 2) {
                    this.botScore++;
                    this.updateScore();
                    if (this.isMultiplayer) {
                        this.wsClient.sendScoreUpdate([this.myScore, this.botScore]);
                    }
                    this.startCountdown();
                } else if (this.ball.position.z > this.arenaDepth / 2) {
                    this.myScore++;
                    this.updateScore();
                    if (this.isMultiplayer) {
                        this.wsClient.sendScoreUpdate([this.myScore, this.botScore]);
                    }
                    this.startCountdown();
                }
            }

            if (this.isMultiplayer && this.wsClient.isHost) {
                this.wsClient.sendBallUpdate(
                    {
                        x: this.ball.position.x,
                        y: this.ball.position.y,
                        z: this.ball.position.z
                    },
                    {
                        x: this.ballDir.x,
                        y: this.ballDir.y,
                        z: this.ballDir.z
                    }
                );
            }

            if (this.myScore >= this.maxScore || this.botScore >= this.maxScore) {
                this.gameOver();
            }
        }
    }
    

    resetBall() {
        this.ball.position.set(0, 0, 0);
        this.ballSpeed = 0.2;

        const horizAngle = (Math.random() - 0.5) * Math.PI / 3;
        const vertAngle = (Math.random() - 0.5) * Math.PI / 6;

        this.ballDir.set(
            Math.sin(horizAngle),
            Math.sin(vertAngle) * 0.5,
            Math.cos(horizAngle)
        );

        if (Math.random() < 0.5) this.ballDir.z *= -1;

        this.spinnySpeed = (Math.random() - 0.5) * 0.1;
        this.ballDir.normalize();
    }

    updateScore() {
        if (this.isMultiplayer) {
            document.getElementById('player-score').textContent = `You: ${this.myScore}`;
            document.getElementById('ai-score').textContent = `Opponent: ${this.botScore}`;
            
            if (this.wsClient.isHost) {
                this.wsClient.sendScoreUpdate([this.myScore, this.botScore]);
            }
        } else {
            document.getElementById('player-score').textContent = `You: ${this.myScore}`;
            document.getElementById('ai-score').textContent = `Bot: ${this.botScore}`;
        }
    }

    gameOver() {
        this.gameOn = false;
        const gameOverScreen = document.getElementById('game-over');
        const winnerMsg = document.getElementById('winner-text');
        
        if (this.myScore > this.botScore) {
            winnerMsg.textContent = this.isMultiplayer ? 'YOU WIN! 🏆' : 'YOU BEAT THE BOT! 🏆';
            epicWin.play();
        } else {
            winnerMsg.textContent = this.isMultiplayer ? 'OPPONENT WINS 💀' : 'GAME OVER 💀';
            rip.play();
        }
        gameOverScreen.style.display = 'block';

        if (this.isMultiplayer) {
            this.wsClient.close();
        }
    }

    restartGame() {
        if (this.isMultiplayer) {
            location.reload();
        } else {
            this.gameOn = true;
            this.myScore = 0;
            this.botScore = 0;
            this.updateScore();
            document.getElementById('game-over').style.display = 'none';
            this.resetBall();
        }
    }

    startCountdown() {
        this.gamePaused = true;
        this.countdown = 3;

        if (this.ball.position.z < 0) {
            this.ball.position.set(0, 0, -this.arenaDepth / 2 + 2);
        } else {
            this.ball.position.set(0, 0, this.arenaDepth / 2 - 2);
        }

        const countdownDisplay = document.getElementById('countdown');
        countdownDisplay.style.display = 'block';
        countdownDisplay.textContent = this.countdown;

        const timer = setInterval(() => {
            this.countdown--;
            countdownDisplay.textContent = this.countdown;

            if (this.countdown <= 0) {
                clearInterval(timer);
                countdownDisplay.style.display = 'none';

                const horizAngle = (Math.random() - 0.5) * Math.PI / 3;
                const vertAngle = (Math.random() - 0.5) * Math.PI / 6;

                this.ballDir.set(
                    Math.sin(horizAngle),
                    Math.sin(vertAngle) * 0.5,
                    this.ball.position.z < 0 ? 1 : -1
                );
                this.ballDir.normalize();
                this.gamePaused = false;
            }
        }, 1000);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.gameOn) {
            this.updateMyPaddle();
            
            if (!this.isMultiplayer) {
                this.updateBotPaddle();
            }
            
            if (!this.isMultiplayer || (this.isMultiplayer && this.wsClient.isHost)) {
                this.updateBall();
            }

            if (this.isMultiplayer && this.playerNumber === 2) {
                if (this.camera.position.z < 0) {
                    this.camera.position.z = this.arenaDepth / 2 + 10;
                    this.camera.lookAt(0, 2, -this.arenaDepth);
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

const game = new PongGame();
