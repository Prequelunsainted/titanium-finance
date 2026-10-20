# CLAUDE.md — Titanium Finance

Contexto do projeto para trabalhar rápido (o Claude Code lê este arquivo sozinho ao abrir a pasta).
**Idioma:** tudo para o usuário em português do Brasil (interface, mensagens, README, commits). Código e nomes técnicos em inglês/português misto, como já está.

## O que é

Controle financeiro pessoal, 100% offline e grátis, em duas versões que trocam dados por CSV/JSON:

| Versão | Pasta | Tecnologia | Estado |
|---|---|---|---|
| **Desktop** | `titanium/` (+ `app.py` atalho) | Python 3.10+, CustomTkinter, SQLite, Matplotlib | Painel, lista, orçamentos, CSV. **Sem** fixo/avulso, mês a mês, financiamentos, tipo/subcategoria, cartão, perfil/bloqueio (pendente, veja Backlog) |
| **Mobile (PWA)** | `mobile/` | JavaScript puro (ES modules), SVG, localStorage, service worker | Completa (v2.3.0) |

- Repositório: `Prequelunsainted/titanium-finance` (o antigo `Controle-financeiro1.2` foi abandonado: não publique mais lá). Dono: Lucas Gabriel (`Prequelunsainted`).
- Design no Figma: <https://www.figma.com/design/hYQlEvC2TZuf26hcK3QDy2> (variáveis de cor claro/escuro, componentes). O código usa as mesmas cores (`--accent #2DD4BF` escuro / `#0D9488` claro etc. em `mobile/style.css` e `titanium/app.py`).
- Modelo visual de referência: o app **Gamera** (`Prequelunsainted/Gamera-Secure-Password-Generator`): mesma estrutura (pacote + `core` puro + testes + PWA em `mobile/`).

## Mapa do mobile (onde mexer)

```
mobile/
├── core.js        # TODAS as regras (puras, sem DOM): valores, datas, períodos, fixos, parcelas/financiamento,
│                  #   saldo do dia, limite do cartão, texto do banco, CSV, dados de demonstração
├── store.js       # estado + localStorage (sanitize defensivo, migração, backupData, clearAll)
├── security.js    # PIN (PBKDF2) e senha/biometria do celular (WebAuthn) — sem DOM, testável
├── lock.js        # tela de bloqueio (overlay), tentativas, re-bloqueio ao sair do app
├── app.js         # interface: páginas, widgets do painel, formulário de lançamento, eventos, boot
├── panels.js      # folhas (dialog) auxiliares: perfil, segurança, cartões, tipos, saldo inicial,
│                  #   personalizar painel, financiamento (com simulação ao vivo)
├── charts.js      # gráficos SVG (barras e rosca)
├── icons.js       # ícones SVG (traço, currentColor) + cor/ícone de cada categoria e tipo (categoryMeta/typeMeta, badge)
├── util.js        # $, esc, initialOf, parseSigned
├── index.html · style.css · sw.js · manifest.webmanifest · icons/
└── tests/ (core.test.js + harness.js) · tests.html   # rodam no Node (CI) e no navegador
```

Regra de ouro: **regra de negócio só em `core.js`** (testável); `app.js`/`panels.js` só desenham e ligam eventos.

## Comandos

```bash
# Desktop (Python). venv de testes: %TEMP%\titanus-venv (customtkinter, pillow, matplotlib)
python -m unittest discover -s tests          # testes do desktop (27)
python -m titanium --demo                      # abre o app desktop com dados de exemplo
python -m titanium adicionar "Mercado" 150,50  # CLI (adicionar|listar|resumo|exportar|importar)

# Mobile
python -m http.server 8000 --directory mobile  # http://localhost:8000  (?demo = dados de exemplo sem salvar)
cd mobile && npm test                          # testes JS no Node 18+ (o CI roda isto)
# sem Node na máquina: abra mobile/tests.html no navegador -> título "TODOS OS TESTES PASSARAM" (43 testes)
```

Parâmetros do modo demo (`?demo&...`): `page=Meses|Financiamentos|Mais|Movimentações|Orçamentos` (a aba "Mais" aparece como **Configurações**), `month=2026-11-01`,
`theme=dark|light`, `nome=Lucas`, `scroll=700`, `sheet[&fixo]`, `panel=perfil|seguranca|cartoes|tipos|personalizar|financiamento`,
`dash=cartao` (painel só com saldo + limite do cartão), `lock` (mostra a tela de bloqueio).

## Dados (mobile)

Uma movimentação (`state.transactions[]`):
`{ id, description, amount>0, kind: "Receita"|"Despesa", category, date "AAAA-MM-DD", recurring, until "AAAA-MM"|null, type (nome do tipo: Pix, Cartão Nubank…), subcategory, plan|null }`

- **Fixo todo mês** = UM registro com `recurring:true` (data = 1ª ocorrência). `expandRange()` gera uma ocorrência por mês (último dia nos meses curtos) até `until`.
- **Financiamento/parcelamento** = UM registro com `plan {system: "price"|"sac"|"sem-juros", principal, entry, rate (% a.m.), count}`; `financingSchedule()` calcula parcelas em **centavos inteiros** (última parcela fecha o saldo em 0).
- Tudo que o usuário vê passa por `transactionsIn()/expandRange()` (ocorrências até hoje) ou `monthOverview()` (mês inteiro, previsto).
- **Saldo nunca é guardado**: `dailyBalances()` calcula `antes + movimento = depois` na hora; `settings.openingBalance` é o saldo inicial.
- **Limite do cartão**: cartão = `{name, limit, closingDay, dueDay}`; o gasto conta quando `type === card.name` dentro da fatura aberta (`cardUsage`).
- Painel = lista de widgets (`WIDGETS` em `app.js`); `settings.dashboard {order, visible}` guarda a escolha do usuário; widget novo entra sozinho no lugar padrão (`dashboardLayout`). "Restaurar padrão" limpa a escolha.
- Backup JSON (`backupData`): tudo **menos** `lock` e ids. CSV: `Data;Descrição;Categoria;Tipo;Valor;Recorrência;Até;Subcategoria;Nome do tipo` (colunas extras opcionais na importação; CSV do desktop sem elas continua valendo).
- Chave do localStorage: `titanium.mobile.v1`; tentativas de PIN: `titanium.lockfails`.

## Interface (v2.3)

- **Sem emojis**: todo símbolo é SVG de `icons.js` (`icon(nome)`; nome desconhecido cai no ícone genérico). Categoria/tipo novo ganha ícone por palpite (regex) ou genérico, com cor estável por hash.
- Categoria e tipo no formulário e filtros da Lista são **botões `.picker`** que abrem uma grade (`openPicker` em `app.js`); o `<select>` continua no HTML, escondido, como fonte do valor.
- Mês a mês: faixa `.mrail` de cartões (`monthWindow()` = 2 meses atrás + 12 à frente), resumo `.mhero` (setas `data-mstep`, deslizar), barra empilhada, filtros `data-mfilter`, linha do tempo por dia.
- Tema em *Configurações* (`settings.theme`: sistema/claro/escuro). Fundo: brilhos radiais em `body::before` (variáveis `--glow*` por tema).
- Foto do perfil: `profile.photo` = data URL JPEG 256×256 (`shrinkPhoto` em `panels.js`); `sanitize` só aceita `data:image/(jpeg|png|webp);base64` < 600 kB. Entra no backup JSON.

## Segurança (como foi decidido — seja honesto com o usuário)

- "Vincular a senha do celular": **não dá para ler a senha**. Usa WebAuthn com `userVerification: "required"` (digital, rosto ou PIN da tela de bloqueio confirmados pelo Android/iPhone). Só funciona em **https** (ou localhost) e com autenticador de plataforma. Alternativa: PIN do app (PBKDF2-SHA256, 150 mil iterações, sal).
- É trava de conveniência (dados no localStorage **sem criptografia**). A tela de bloqueio esconde o conteúdo (`body.locked`), espera crescente após 5 erros, re-bloqueia ao voltar conforme o prazo (`lock.timeout`), e há "Esqueci o acesso" (apaga tudo, com confirmação digitando APAGAR).
- `ui.skipRelockUntil` evita re-bloquear quando o seletor de arquivos/compartilhar tira o app da tela (expira em 20 s).
- **Não foi testado em celular real** (só com autenticador simulado). No computador de desenvolvimento, abrir o app com a senha do celular ativa faz o Windows Hello aparecer e **trava o navegador de teste**: para testar, ponha `lock.device = null` no localStorage.

## Pesquisa de concorrente (Mobills, Play Store, 4,2★) — o que aprendemos

Fonte: 6 prints de avaliações enviados em `WhatsApp Unknown 2026-10-19 … .zip` (resumido aqui, sem copiar o texto).

| Reclamação dos usuários | Como o Titanium responde |
|---|---|
| Sincronização falha, perde lançamentos, bagunça saldos | **Local-first, sem nuvem/sincronização**; backup JSON/CSV; lembrete de backup (30 dias); **Desfazer** em exclusões/edições em massa |
| Saldo do dia não bate (anterior + lançamentos ≠ saldo) | Saldo do dia **sempre calculado na hora** e mostrado com a conta na lista; saldo inicial configurável; teste que prova a identidade |
| Subcategoria não repete ao editar; relatório por subcategoria só no Premium | Subcategoria grátis, lembrada pela descrição, "aplicar a todos com a mesma descrição", rosca por subcategoria |
| Limite gratuito de lançamentos some sem aviso; recursos básicos pagos | **Sem limite, sem anúncios, sem assinatura, sem conta** (dito no app e no README) |
| Notificação de Pix recebido sempre vira despesa | "Colar mensagem do banco" + **Compartilhar para o Titanium** (share_target): lê valor, tipo (Pix…), e decide receita/despesa **sem chutar** (pergunta se não souber) |
| Suporte só por robô, cancelamento com erro | Não há conta nem cobrança; dados e arquivos sob controle do usuário |

O que elogiam e mantemos: ser gratuito de verdade, ter a maioria das informações que importam (cartões, categorias, relatórios) e muitos recursos úteis.

## Armadilhas conhecidas (economizam tempo)

- **Service worker em desenvolvimento serve arquivos antigos.** O app não registra o SW em `localhost` (use `?sw` para testar o SW). Ao publicar: **troque `CACHE` em `sw.js` e `VERSION` em `app.js`** e liste arquivos novos em `ASSETS`.
- Navegador de teste do app (painel Browser): usar servidor sem cache (`_tools/devserver.py`, fora do repo) e janela `resize_window mobile`. Screenshots do painel às vezes chegam um passo atrás: tire duas.
- Prints para o README: Edge headless não aceita janela < 500 px → use `_tools/phone/frame.html` (iframe 390×844) e recorte 780×1688 com PIL; `_tools/compose.py` monta a faixa com cantos arredondados.
- Scripts de patch longos: grave o `.py` com a ferramenta de arquivos e rode (heredocs grandes no bash falham). Arquivos de teste têm o BOM como caractere literal em alguns pontos: confira com `od -c` antes de casar strings.
- `dialog` fecha sem disparar o evento `close` no navegador de teste: `panels.js` atualiza a tela explicitamente em `close()`.
- Windows: caminhos longos no `git clone` (use `-c core.longpaths=true` e pastas curtas); `python` pode não existir no PATH → use `py`.

## Git e publicação

- Branch de trabalho: `v2-hub`; publica-se com `git push titanium v2-hub:main` (remote `titanium` = titanium-finance; `origin` é o repositório antigo, não use) (sem `gh` instalado; sem PR). Pode abrir o login do GitHub (Git Credential Manager) em uma janela.
- Autor local dos commits: `Lucas Gabriel Barreto <lucas2907.office@gmail.com>`. Mensagem em português; termine com a linha `Co-Authored-By` indicada no contexto da sessão.
- **Só publique depois de o usuário dizer "sim"** (ele já aprovou os pushes anteriores caso a caso).
- GitHub Pages precisa ser ativado pelo usuário (*Settings → Pages → main / root*) para a URL do PWA: `https://prequelunsainted.github.io/titanium-finance/` (a raiz redireciona para `mobile/`).

## Backlog

1. **Paridade no desktop** (proposta já criada como tarefa): fixo/avulso, mês a mês, financiamentos, nome do tipo/subcategoria, cartão, saldo do dia, CSV com as colunas novas. Reaproveitar a lógica de `mobile/core.js` portando para `titanium/core.py` + migração SQLite (`ALTER TABLE`).
2. Testar bloqueio por senha do celular e "compartilhar para o app" em **celular real** (Android Chrome instalado como PWA).
3. Ideias: mais de um perfil, transferência entre contas, escolher ícone/cor da categoria à mão, metas de economia, gráfico de patrimônio, notificação de vencimento, antecipação de parcelas com desconto de juros.
4. Renomear o arquivo do Figma para "Titanium Finance — Hub" (a API não renomeia).
