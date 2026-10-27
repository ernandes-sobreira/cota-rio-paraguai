# Migração para ANA HidroWebService — fase segura

**Estado:** adaptador de diagnóstico criado em branch, sem ativação em produção e sem alterar os dados publicados.

O painel atual usa a API pública antiga da ANA para cotas de Cáceres, Ladário e Porto Murtinho, separada das observações da Marinha. A ANA anunciou descontinuação do serviço legado e disponibilizou a API HidroWebService autenticada.

## Configuração

No GitHub, abra Settings → Secrets and variables → Actions → New repository secret e crie:
- `ANA_IDENTIFICADOR`: identificador autorizado pela ANA.
- `ANA_SENHA`: senha recebida da ANA.

Não copie credenciais para `index.html`, `dashboard.js`, arquivos JSON, commits, issues ou conversas públicas. Não use `NEXT_PUBLIC_*`, `VITE_*`, nem prefixos equivalentes para elas.

Execute Actions → **Validar API ANA HidroWebService (manual, sem publicar dados)** → Run workflow e selecione a branch `integracao-ana-hidrowebservice-segura`. Esse teste consulta a série telemétrica adotada de Cáceres e **mostra somente quantidade de registros e estado**. Não publica dados nem modifica o `main`.

## Próximas verificações antes de ligar o feed

1. Confirmar autenticação e identificação da estação no novo inventário (não assumir que todos os códigos legados coincidem).
2. Conferir no JSON real os nomes dos campos, unidades, timezone, valores ausentes, qualidade e datas.
3. Criar conversão determinística com testes e snapshots sanitizados; não registrar o token nos logs.
4. Manter ANA e Marinha em séries separadas; não converter cota em vazão nem fundir zeros de régua.
5. Ativar coleta automática apenas após validar valores observados e política de frequência/limites ANA; preservar o último feed válido em falhas.

A mudança foi deliberadamente limitada à branch e ao diagnóstico para evitar interromper o painel público ou expor as credenciais pessoais do pesquisador.
