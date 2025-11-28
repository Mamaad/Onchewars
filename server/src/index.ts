import express from "express";
import cors from "cors";
import path from "path";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";

const app = express();
const PORT = 2000;

// Augmentation de la limite pour les images base64
app.use(express.json({ limit: '50mb' }) as any);
app.use(cors());

// Route de santé pour vérifier que le serveur tourne (même sans DB)
app.get('/api/health', (req, res) => res.send('Online'));

// --- STATIC FILES (Frontend) ---
// On sert le dossier dist du client
app.use(express.static(path.join(__dirname, '../../client/dist')) as any);

// Variable globale pour le repository (initialisée après connexion DB)
let userRepo: any = null;

// Initialisation Base de Données
AppDataSource.initialize().then(async () => {
    console.log("✅ Database connected successfully.");
    userRepo = AppDataSource.getRepository(User);
}).catch(error => {
    console.error("❌ Database connection failed:", error);
});

// Middleware pour vérifier la DB avant chaque requête API
const checkDb = (req: any, res: any, next: any) => {
    if (!userRepo) {
        return res.status(503).json({ message: "Le serveur démarre ou la base de données est inaccessible." });
    }
    next();
};

// --- API ROUTES ---

// Register
app.post("/api/auth/register", checkDb, async (req, res) => {
    try {
        const { username, password, email, initialPlanet } = req.body;
        
        const existing = await userRepo.findOneBy({ username });
        if (existing) return res.status(400).json({ message: "Pseudo pris." });

        const newUser = new User();
        newUser.username = username;
        newUser.password = password; 
        newUser.email = email;
        newUser.isAdmin = username.toLowerCase() === 'admin';
        
        newUser.planets = [initialPlanet];
        newUser.currentPlanetId = initialPlanet.id; 
        newUser.research = []; 
        newUser.officers = [];
        newUser.missions = [];
        newUser.reports = [];
        newUser.talents = [];
        newUser.inventory = [];
        newUser.completedQuests = [];
        newUser.points = { total: 0, buildings: 0, fleet: 0, defense: 0, research: 0, economy: 0 };

        await userRepo.save(newUser);
        
        const { password: _, ...userNoPass } = newUser;
        res.json({ success: true, user: { ...userNoPass, id: newUser.id }, token: newUser.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

// Login
app.post("/api/auth/login", checkDb, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await userRepo.findOneBy({ username });

        if (!user || user.password !== password) {
            return res.status(401).json({ message: "Identifiants invalides." });
        }

        const { password: _, ...userNoPass } = user;
        res.json({ success: true, user: { ...userNoPass, id: user.id }, token: user.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

// Get State
app.get("/api/game/state", checkDb, async (req, res) => {
    const id = req.headers['authorization'];
    if (!id) return res.status(401).send();

    const user = await userRepo.findOneBy({ id });
    if (!user) return res.status(404).send();

    const { password: _, ...userNoPass } = user;
    if(!userNoPass.planets) userNoPass.planets = [];
    
    res.json({ user: { ...userNoPass, currentPlanetId: userNoPass.planets[0]?.id } });
});

// Save State
app.post("/api/game/sync", checkDb, async (req, res) => {
    try {
        const id = req.headers['authorization'];
        if (!id) return res.status(401).send();

        const user = await userRepo.findOneBy({ id });
        if (!user) return res.status(404).send();

        const body = req.body;
        // Mise à jour de tous les champs
        user.planets = body.planets;
        user.resources = body.resources;
        user.research = body.research;
        user.fleet = body.fleet;
        user.defenses = body.defenses;
        user.buildings = body.buildings;
        user.missions = body.missions;
        user.reports = body.reports;
        user.points = body.points;
        user.lastUpdate = Date.now();
        user.commanderXp = body.commanderXp;
        user.commanderLevel = body.commanderLevel;
        user.skillPoints = body.skillPoints;
        user.talents = body.talents;
        user.inventory = body.inventory;
        user.theme = body.theme;
        user.vacationMode = body.vacationMode;
        user.completedQuests = body.completedQuests;
        user.allianceId = body.allianceId;

        await userRepo.save(user);
        res.json({ success: true });
    } catch (e) {
        console.error("Sync error:", e);
        res.status(500).json({ success: false });
    }
});

// Highscores
app.get("/api/highscores", checkDb, async (req, res) => {
    try {
        const users = await userRepo.find({
            select: ["id", "username", "points", "allianceId", "isAdmin"],
            take: 100
        });
        users.sort((a: any, b: any) => (b.points?.total || 0) - (a.points?.total || 0));
        res.json(users);
    } catch (e) {
        res.json([]);
    }
});

// Fallbacks (Mock endpoints pour éviter 404 sur fonctionnalités futures)
app.get("/api/galaxy", (req, res) => res.json({}));
app.get("/api/alliance", (req, res) => res.json([]));
app.get("/api/market", (req, res) => res.json([]));
app.get("/api/chat", (req, res) => res.json([]));

// React Routing (SPA) - Doit être en dernier
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

// Démarrage du serveur INDÉPENDAMMENT de la DB
// On écoute sur 0.0.0.0 pour être sûr que Nginx puisse se connecter via 127.0.0.1 ou l'IP locale
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server started on port ${PORT}`);
});