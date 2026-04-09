# Extracao de layout - portalmodelo.html + imagem

## Fontes usadas
- HTML bruto: docs/portalmodelo.html
- Referencia visual: imagem enviada (portal Odontoprev)

## Blocos estruturais extraidos
1. Faixa superior de status
- Campos: Codigo do Credenciado, Protocolo Atual, Rede
- Visual: chips/capsulas cinza claro

2. Barra principal azul escura
- Marca/Logo a esquerda
- Acoes a direita: Trocar Senha e Sair

3. Corpo em 3 colunas
- Esquerda: menu vertical com icones e item ativo Home
- Centro: area principal com cards e graficos
- Direita: painel Comunicados com cards de alerta em fundo claro

4. Centro (conteudo)
- Card de boas-vindas com nome do profissional
- Card de protocolo vigente (Beta)
- Linha de 4 KPI cards
- Linha com 2 paineis de grafico

5. Direita (comunicados)
- Titulo grande Comunicados
- Lista vertical de avisos com destaque vermelho

## Tokens visuais observados
- Primario escuro: #062a56
- Primario medio: #1257a3
- Fundo geral: #eef1f5
- Cartao: #ffffff
- Borda: #d9dfe8
- Alerta: fundo #fdeeee, acento #cb2f2f
- Arredondamento dominante: 10-14px

## Entrega gerada
- Wireframe fiel da composicao em: docs/portalmodelo-extracao-layout.html

## Observacao tecnica
- O arquivo portalmodelo.html esta extremamente grande e embutido (fonts/scripts/base64), entao a extracao foi feita por ancoras de conteudo e hierarquia visual.
- O objetivo do wireframe e servir como base de implementacao limpa e editavel.
