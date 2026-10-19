# 🏛️ Titanus Finance Control

![Python](https://img.shields.io/badge/Python-3.10+-306998?style=for-the-badge&logo=python&logoColor=white)
![CustomTkinter](https://img.shields.io/badge/CustomTkinter-UI-2DD4BF?style=for-the-badge)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Matplotlib](https://img.shields.io/badge/Matplotlib-gráficos-11557C?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

O **Titanus** é um app desktop de controle financeiro pessoal feito em Python. Ele reúne em um só painel o saldo do período, as receitas e despesas, a evolução mês a mês, os gastos por categoria e os orçamentos, tudo 100% offline e salvo localmente em SQLite.

![Painel no tema escuro](docs/painel-escuro.png)

---

## 🚀 Funcionalidades

- 📊 **Painel (hub)** com 4 indicadores: saldo, receitas, despesas e taxa de economia. Cada um traz a variação em relação ao período anterior, comparando o mesmo trecho (1º a 19 de outubro contra 1º a 19 de setembro) para não distorcer.
- 📈 **Gráfico de receitas x despesas** dos últimos 6 ou 12 meses. Passe o mouse sobre uma barra para ver o valor.
- 🍩 **Gastos por categoria** em rosca, com legenda em porcentagem. Passe o mouse sobre uma fatia para destacá-la.
- 🗓️ **Períodos rápidos:** Mês, 3 meses, Ano ou Tudo. O período escolhido vale para o painel e para a lista.
- 📋 **Movimentações** em tabela com busca instantânea, filtros por tipo e categoria, ordenação por coluna e totais do que está filtrado.
- 🎯 **Orçamentos mensais** por categoria, com barra que fica amarela a partir de 90% e vermelha quando o limite estoura.
- ⚡ **Cadastro rápido:** valor aceita `150,50`, `150.50` ou `1.500`; data aceita `14/10`, `hoje` ou `ontem`; ao repetir uma descrição, o tipo e a categoria da última vez são preenchidos sozinhos.
- 📁 **Exportação CSV** pronta para o Excel em português (`;` e vírgula decimal).
- 🎨 **Tema claro, escuro ou do sistema**, e o app lembra suas preferências entre execuções.
- 🔁 **Migração automática:** na primeira execução, os dados do `financeiro.db` da versão 1.x são importados.
- ⌨️ **Atalhos:** `Ctrl+N` nova movimentação · `Ctrl+F` buscar · `Ctrl+1/2/3` trocar de tela · `Ctrl+E` exportar · `Delete` excluir · duplo clique para editar.
- 🖥️ **Modo terminal** para scripts e automações.

| Tema claro | Nova movimentação |
|---|---|
| ![Painel no tema claro](docs/painel-claro.png) | ![Janela de nova movimentação](docs/nova-movimentacao.png) |

| Movimentações | Orçamentos |
|---|---|
| ![Tela de movimentações](docs/movimentacoes.png) | ![Tela de orçamentos](docs/orcamentos.png) |

---

## 📦 Instalação

```bash
git clone https://github.com/Prequelunsainted/Controle-financeiro1.2.git
cd Controle-financeiro1.2
pip install -r requirements.txt
```

## ▶️ Como usar

Interface gráfica:

```bash
python -m titanus
```

Quer conhecer o app sem digitar nada? Abra com dados de exemplo. Eles ficam só na memória e não tocam nos seus dados:

```bash
python -m titanus --demo
```

> O antigo `python app.py` continua funcionando.

Terminal:

```bash
python -m titanus adicionar "Supermercado" 150,50 -c Alimentação
python -m titanus adicionar "Salário" 5.000 --receita -c Trabalho --data 05/10
python -m titanus listar --periodo mes
python -m titanus resumo --periodo ano
python -m titanus exportar relatorio.csv --periodo tudo
python -m titanus importar financeiro.db     # dados da versão 1.x
python -m titanus --help
```

Também é possível instalar como comando (`pip install .`) e rodar apenas `titanus`.

### Onde ficam os dados

| Sistema | Pasta |
|---|---|
| Windows | `%APPDATA%\Titanus\` |
| macOS | `~/Library/Application Support/Titanus/` |
| Linux | `~/.local/share/Titanus/` |

O banco é o `titanus.db` e as preferências ficam em `settings.json`. Para usar outro arquivo, passe `--db caminho.db` (ou defina a variável `TITANUS_DB`).

## 🏗️ Gerando o executável

```bash
pip install -r requirements.txt pyinstaller
python build_exe.py
```

O arquivo fica em `dist/Titanus.exe`.

---

## 🎨 Design

A interface foi desenhada antes no Figma, com variáveis de cor para os temas claro e escuro e componentes reutilizáveis (card de indicador, linha de movimentação, linha de orçamento e item de menu). O código usa exatamente as mesmas cores.

- Arquivo no Figma: [Titanus Finance — Hub](https://www.figma.com/design/hYQlEvC2TZuf26hcK3QDy2)

## 🗂️ Estrutura

```
titanus/
├── core.py        # regras: valores, datas, períodos, totais, orçamentos (sem interface, 100% testável)
├── storage.py     # SQLite: movimentações, orçamentos, importação da v1 e CSV
├── app.py         # interface gráfica (CustomTkinter)
├── charts.py      # gráficos Matplotlib embutidos, com dica ao passar o mouse
├── assets.py      # logo e ícone gerados a partir da silhueta do Titanus
├── settings.py    # preferências salvas entre execuções
├── demo.py        # dados de exemplo do modo --demo
├── __main__.py    # ponto de entrada e linha de comando
└── assets/titanus.png
tests/             # testes automatizados
build_exe.py       # gera o Titanus.exe com PyInstaller
app.py             # atalho compatível com a versão 1.x
```

## ✅ Testes

```bash
python -m unittest discover -s tests -v
```

Os testes também rodam automaticamente no GitHub Actions a cada push.

---

## 🛠️ Tecnologias

- **[Python 3.10+](https://www.python.org/)**
- **[CustomTkinter](https://github.com/TomSchimansky/CustomTkinter):** interface gráfica moderna.
- **[Matplotlib](https://matplotlib.org/):** gráficos do painel.
- **[Pillow](https://python-pillow.org/):** logo e ícone.
- **SQLite:** banco de dados local, sem servidor.

## 📄 Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
