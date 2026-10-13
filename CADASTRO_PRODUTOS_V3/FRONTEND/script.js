class Produto {
    #preco;
    #quantidade;

    constructor(nome, preco, quantidade) {

        if (!nome || preco <= 0 || quantidade <= 0) {
            throw new Error("Dados inválidos para o produto");
        }

        this.nome = nome;
        this.#preco = parseFloat(preco);
        this.#quantidade = parseInt(quantidade);
    }

    get preco() {
        return this.#preco;
    }

    get quantidade() {
        return this.#quantidade;
    }

    valorTotal() {
        return this.#preco * this.#quantidade;
    }

    toJSON() {
        return {
            nome: this.nome,
            preco: this.#preco,
            quantidade: this.#quantidade
        };
    }
}


const API_URL = '/produtos';
let supabaseClient;
let session;
let usuarioAtual;

const mensagem = document.getElementById('mensagem');

function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto;
    mensagem.classList.toggle('erro', erro);
}

async function requisicaoApi(url, options = {}) {
    const { data } = await supabaseClient.auth.getSession();
    session = data.session;

    if (!session) {
        window.location.assign('/login');
        throw new Error('Sua sessão terminou. Entre novamente.');
    }

    const resposta = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
            Authorization: `Bearer ${session.access_token}`
        }
    });

    if (resposta.status === 401) {
        await supabaseClient.auth.signOut();
        window.location.assign('/login');
    }

    return resposta;
}

document.getElementById('produto-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
        const produto = new Produto(
            document.getElementById('nome').value.trim(),
            document.getElementById('preco').value,
            document.getElementById('quantidade').value
        );
        const resposta = await requisicaoApi(API_URL, {
            method: 'POST',
            body: JSON.stringify(produto.toJSON())
        });

        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível adicionar o produto.');
        }

        event.target.reset();
        mostrarMensagem('Produto adicionado.');
        await renderizarTabela();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
});

async function renderizarTabela() {
    const tabela = document.querySelector('#tabela-produtos tbody');
    tabela.replaceChildren();

    try {
        const resposta = await requisicaoApi(API_URL);
        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível carregar os produtos.');
        }

        const produtos = await resposta.json();
        let totalAcumulado = 0;

        produtos.forEach((dados) => {
            const produto = new Produto(dados.nome, dados.preco, dados.quantidade);
            totalAcumulado += produto.valorTotal();

            const row = document.createElement('tr');
            [
                produto.nome,
                `R$ ${produto.preco.toFixed(2)}`,
                String(produto.quantidade),
                `R$ ${produto.valorTotal().toFixed(2)}`
            ].forEach((valor) => {
                const cell = document.createElement('td');
                cell.textContent = valor;
                row.appendChild(cell);
            });

            if (usuarioAtual.role === 'admin') {
                const actions = document.createElement('td');
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'btn-editar';
                editButton.textContent = 'Editar';
                editButton.addEventListener('click', () => editarProduto(dados));

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn-apagar';
                deleteButton.textContent = 'Excluir';
                deleteButton.addEventListener('click', () => deletarProduto(dados.id));

                actions.append(editButton, deleteButton);
                row.appendChild(actions);
            }

            tabela.appendChild(row);
        });

        document.getElementById('total-estoque').textContent =
            `Total em estoque: R$ ${totalAcumulado.toFixed(2)}`;
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

async function editarProduto(produto) {
    const nome = window.prompt('Nome do produto:', produto.nome);
    if (nome === null) return;
    const preco = window.prompt('Preço:', produto.preco);
    if (preco === null) return;
    const quantidade = window.prompt('Quantidade:', produto.quantidade);
    if (quantidade === null) return;

    try {
        const resposta = await requisicaoApi(`${API_URL}/${produto.id}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, preco, quantidade })
        });
        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível atualizar o produto.');
        }

        mostrarMensagem('Produto atualizado.');
        await renderizarTabela();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

async function deletarProduto(id) {
    if (!window.confirm('Excluir este produto?')) return;

    try {
        const resposta = await requisicaoApi(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível excluir o produto.');
        }

        mostrarMensagem('Produto excluído.');
        await renderizarTabela();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

document.getElementById('limpar-tabela').addEventListener('click', async () => {
    if (!window.confirm('Excluir todos os produtos?')) return;

    try {
        const resposta = await requisicaoApi(API_URL, { method: 'DELETE' });
        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível limpar a tabela.');
        }

        mostrarMensagem('Tabela limpa.');
        await renderizarTabela();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.assign('/login');
});

async function iniciar() {
    try {
        const respostaConfig = await fetch('/config');
        const config = await respostaConfig.json();
        if (!respostaConfig.ok) throw new Error(config.erro || 'Configuração ausente.');

        supabaseClient = window.supabase.createClient(config.url, config.anonKey);
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
        if (!session) {
            window.location.replace('/login');
            return;
        }

        const respostaUsuario = await requisicaoApi('/me');
        if (!respostaUsuario.ok) {
            const erro = await respostaUsuario.json().catch(() => null);
            throw new Error(erro?.erro || 'Não foi possível carregar o perfil.');
        }

        usuarioAtual = await respostaUsuario.json();
        document.getElementById('usuario-atual').textContent =
            `${usuarioAtual.email} (${usuarioAtual.role === 'admin' ? 'Administrador' : 'Usuário'})`;

        const ehAdmin = usuarioAtual.role === 'admin';
        document.getElementById('limpar-tabela').hidden = !ehAdmin;
        document.getElementById('coluna-acoes').hidden = !ehAdmin;
        await renderizarTabela();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

iniciar();