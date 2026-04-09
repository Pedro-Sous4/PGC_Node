# Guia de Textos de UI (pt-BR)

Este guia define o padrão editorial de interface do sistema PGC.
Objetivo: manter consistência, clareza e linguagem funcional para usuários operacionais.

## 1) Idioma e tom

- Sempre usar português do Brasil.
- Preferir frases curtas e diretas.
- Evitar inglês na UI quando houver equivalente claro em português.
- Evitar linguagem técnica de API quando o usuário não precisa desse detalhe.

## 2) Capitalização

- Usar "sentence case" em títulos e botões.
- Evitar Title Case em excesso.

Exemplos:
- Correto: "Dashboard de envio"
- Correto: "Baixar ZIP final"
- Evitar: "Download ZIP Final"

## 3) Acentuação e ortografia

- Sempre aplicar acentuação correta.

Checklist rápido:
- não
- ações
- gestão
- importação
- validação
- relatório
- histórico
- período
- média
- número
- específico
- resolução
- observação
- já

## 4) Termos preferenciais

Use estes termos na UI:

- "ID da solicitação" no lugar de `request_id`.
- "Registros" no lugar de "logs".
- "Baixar" no lugar de "download".
- "Tentativas" no lugar de "attempts".
- "Área de trabalho" no lugar de "workspace".
- "Processamentos" no lugar de "jobs" (quando fizer sentido no menu/fluxo).

## 5) Mensagens de ação

- Botões devem começar por verbo no infinitivo quando aplicável.

Exemplos:
- "Iniciar processamento"
- "Atualizar status e registros"
- "Salvar template"
- "Reprocessar credores com erro"

## 6) Mensagens de estado e erro

- Ser objetivas e orientadas ao contexto.
- Evitar mensagens genéricas sem ação clara.

Exemplos:
- "Carregando status do processamento..."
- "Sem registros no momento."

## 7) Rótulos técnicos expostos

- Só mostrar termos técnicos quando forem realmente necessários para operação.
- Quando precisar mostrar, contextualizar em linguagem humana.

Exemplo:
- Preferir "ID da solicitação" a "request_id".

## 8) Padrão de consistência

Antes de fechar qualquer tela nova, validar:

- Está em pt-BR?
- Está com acentuação correta?
- Evita inglês desnecessário?
- Usa os termos preferenciais deste guia?
- Botões estão claros e acionáveis?

## 9) Validação automática

- Comando dedicado: `npm run lint:ui-ptbr`
- O comando `npm run lint` já executa essa validação automaticamente.
- Se houver termos em inglês na UI, o processo falha com arquivo e linha para correção.

---

Última atualização: 2026-03-13
