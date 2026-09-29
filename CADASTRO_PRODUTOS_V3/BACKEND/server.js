const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.join(__dirname, '.env') });
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
    : null;

if (pool) {
    pool.query('SELECT NOW()')
        .then(() => console.log('Conectado com sucesso ao PostgreSQL (Supabase)'))
        .catch((erro) => console.error('Erro de conexão com o Supabase:', erro.message));
} else {
    console.warn('DATABASE_URL não definida. O backend continuará em modo sem banco de dados.');
}

function garantirBanco(req, res, next) {
    if (!pool) {
        return res.status(503).json({
            erro: 'Banco de dados indisponível. Configure DATABASE_URL no ambiente do Vercel.'
        });
    }
    next();
}

app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../FRONTEND')));
app.use('/img', express.static(path.join(__dirname, 'img')));

app.get('/health', (req, res) => {
    res.json({ ok: true, message: 'Backend funcionando' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../FRONTEND/index.html'));
});

app.get('/produtos', garantirBanco, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
        res.json(result.rows);
    } catch (erro) {
        console.error('Erro ao buscar produtos:', erro);
        res.status(500).json({ erro: 'Erro ao buscar produtos no banco de dados.' });
    }
});

app.post('/produtos', garantirBanco, async (req, res) => {
    const { nome, preco, quantidade, imagem } = req.body;
    const nomeNormalizado = typeof nome === 'string' ? nome.trim() : '';
    const precoNumero = Number(preco);
    const quantidadeNumero = Number(quantidade);

    if (
        !nomeNormalizado ||
        !Number.isFinite(precoNumero) ||
        !Number.isInteger(quantidadeNumero) ||
        precoNumero <= 0 ||
        quantidadeNumero <= 0
    ) {
        return res.status(400).json({ erro: 'Dados inválidos enviados para o servidor' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO produtos (nome, preco, quantidade, imagem)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nomeNormalizado, precoNumero, quantidadeNumero, imagem || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (erro) {
        console.error('Erro ao salvar produto:', erro);
        res.status(500).json({ erro: 'Erro interno ao salvar produto' });
    }
});

app.delete('/produtos/:id', garantirBanco, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
    }

    try {
        const result = await pool.query('DELETE FROM produtos WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        res.status(204).send();
    } catch (erro) {
        console.error('Erro ao deletar produto:', erro);
        res.status(500).json({ erro: 'Erro ao deletar produto.' });
    }
});

app.delete('/produtos', garantirBanco, async (req, res) => {
    try {
        await pool.query('DELETE FROM produtos');
        res.status(204).send();
    } catch (erro) {
        console.error('Erro ao limpar produtos:', erro);
        res.status(500).json({ erro: 'Erro ao limpar banco de dados.' });
    }
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Servidor backend rodando em http://localhost:${PORT}`);
    });

    async function encerrarServidor() {
        server.close();
        if (pool) {
            await pool.end();
        }
    }

    process.on('SIGINT', encerrarServidor);
    process.on('SIGTERM', encerrarServidor);
}

module.exports = app;