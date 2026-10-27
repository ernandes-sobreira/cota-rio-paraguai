# ANA — arquitetura intermediária e estado real

Preparado em branch de desenvolvimento; **não implantado**. A ANA já devolveu 401 ao GitHub Actions, embora Swagger tenha devolvido 200. Migrar para outro provedor **não garante** que a ANA aceite a conexão.

## Componentes
- `ana-relay/worker.mjs`: Worker isolado, com whitelist de três estações e cron. Credenciais apenas no ambiente do Worker, nunca no navegador.
- `ANA_CACHE`: armazenamento KV somente do diagnóstico, sem token, CPF, senha ou valores hidrológicos não validados.
- Única rota pública `GET /health`: mostra estado do diagnóstico, nunca credenciais nem dados brutos.

## Para implantar
1. Criar conta/Worker e namespace KV na Cloudflare. Usar `wrangler.toml.example` como base e substituir o identificador KV; não versionar tokens de implantação.
2. Cadastrar `ANA_IDENTIFICADOR` e `ANA_SENHA` como **Worker Secrets**; não enviar a senha por chat ou arquivo.
3. Fazer uma consulta assistida em ambiente controlado, sem repetição automática de autenticação. Confirmar com ANA eventual restrição de IP/provedor e as condições de consumo automatizado.
4. Validar os campos/unidades/tempo/qualidade do JSON real. **Só então** criar adaptador que publique dados validados em cache público.
5. Associar ao painel em novo PR, com testes de comparação ANA/Marinha e rollback. Não substituir o fluxo atual antes disso.

## Nota de segurança
Este Worker não funciona como proxy aberto, não expõe token, não devolve dados brutos. Se não houver consentimento para o intermediário/automação, manter o cron desabilitado antes do deploy. Não confundir 'intermediário' com autorização formal da ANA.
