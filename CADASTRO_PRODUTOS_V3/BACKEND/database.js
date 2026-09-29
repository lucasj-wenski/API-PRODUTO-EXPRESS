const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'DATA', 'estoque.db');

const db = new sqlite3.Database(dbPath, (erro) => {
    if (erro) {
        console.error('Erro ao abrir banco:', erro.message);
        return;
    }

    console.log('Banco de dados aberto com sucesso.');
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS produtos(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco REAL NOT NULL,
            quantidade INTEGER NOT NULL,
            imagem LONGTEXT
        )
    `, (erro) => {
        if (erro) {
            console.error('Erro ao criar tabela produtos:', erro.message);
        }
    });
});

module.exports = db;