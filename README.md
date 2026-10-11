# Cota Rio Paraguai · V2.2

Painel de cotas de Cáceres, Ladário e Porto Murtinho: https://ernandes-sobreira.github.io/cota-rio-paraguai/

Painel com os três locais sobrepostos e, em seguida, um gráfico e uma régua por estação. Abertura em 2026, com rio esquemático animado, pausa e respeito à preferência de movimento reduzido. A página principal não depende de fontes, bibliotecas externas ou requisições para exibir os gráficos iniciais. Implementação estática, sem chaves no navegador ou dados sintéticos.

## Painel principal

- **2026:** registros reais da API pública da ANA, agregados por dia. Média, mínima, máxima e desvio dos registros disponíveis; leitura pontual da Marinha separada. Cinco observações SGB de Porto Murtinho aparecem como losangos, sem ligar lacunas.
- **Comparar:** curvas dos três locais sobrepostas e gráficos individuais em sequência. Alternar entre ambos, somente sobreposição e somente separados; selecionar estações e comparar cotas locais ou mudança desde o primeiro período observado em comum.
- Três gráficos independentes com mínima, máxima, média, faixa de ±1 desvio-padrão amostral e ponto da última leitura na data real.
- **Série histórica:** estatísticas das leituras diárias de cada ano, 1966–2025. O ponto atual é separado e não prolonga a curva histórica.
- **Ciclo anual:** estatísticas para cada dia do calendário nos anos da base; 29/02 usa somente dias efetivamente observados. Sem suavização ou preenchimento.
- Cotas, variações, data de cada leitura e última verificação em horário de MT visíveis. Horário da medição explicitamente não informado quando ausente na tabela oficial.
- Régua esquemática referida ao zero local, sem representar o fundo nem a profundidade do rio.
- HTML com gráficos prontos, antes de executar JavaScript. Script clássico sem `AbortSignal.timeout`, feed com limite de espera e preservação dos dados em caso de falha. Último feed válido pode ser guardado no navegador.
- Consulta ao gráfico por ponteiro ou setas do teclado e exportação SVG dentro dos detalhes de cada estação.
- Análises completas, tendências e contextos ecológicos e humanos em [analises.html](analises.html).

## Funcionalidades

- Últimas leituras publicadas, datas individuais, variação informada pela Marinha e situação da consulta.
- Arquivos diários incrementais ANA e Marinha separados. A análise recente usa o ano ANA; regressão descritiva somente com observações suficientes nos últimos sete dias. Uma leitura isolada não é apresentada como evolução.
- Histórico diário original, de 01/01/1966 a 26/12/2025: 65.257 observações, preservadas sem alterações.
- Recortes, médias/mínimas/máximas mensais e anuais, dispersão, percentis e cobertura.
- Sazonalidade 1991–2020 (mediana e P10–P90), comparação de dois anos.
- Tendência linear, R² e inclinação de Sen; ≥90% de cobertura anual e no mínimo dez anos elegíveis. Mann–Kendall exploratório sem correção de autocorrelação no arquivo JSON.
- Downloads CSV/JSON e gráficos SVG; contextos ecológicos e humanos com referências da Embrapa e Marinha.
- Versão anterior conservada em `versao-anterior.html`.

## Atualização automática

Leia [ATUALIZACAO.md](ATUALIZACAO.md). Coleta direta no GitHub Actions às 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4); pode atrasar. A ANA é consultada via `DadosHidrometeorologicos`, sem chave; atualiza os meses que cobrem os últimos 40 dias, incorporando revisões e preservando a cópia anterior em falhas. Em 11/10/2026 a tabela Marinha recusou a coleta direta com HTTP 403. Foi ativada também uma tarefa agendada do ChatGPT, pela manhã e à tarde, para consultar a tabela pública oficial e publicar os dados via API do GitHub. Essa tarefa depende de permanecer ativa e de manter o acesso conectado ao GitHub e à leitura pública. Não requer chave paga da Marinha. O workflow usa o `GITHUB_TOKEN` automático do repositório.

O feed JSON é próprio do projeto, **não uma API oficial da Marinha**:

- `https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/telemetry-daily.json` (ANA, estatísticas diárias e procedência)
- `https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/latest.json`
- `https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/daily.json`

A interface busca os feeds ao abrir, ao clicar em atualizar e a cada 15 minutos enquanto está visível. O agendamento funciona com o site fechado. Em caso de falha remota, usa a cópia local e mostra essa situação. Não depender de commits do `GITHUB_TOKEN` dispararem um build do Pages: a consulta ao feed raw é independente.

### Esquema de observação

`station`, `date` (AAAA-MM-DD), `level_m`, `variation_m` (pode ser null), `source_url`, `observation`, `measurement_time` (null quando não informado), `collected_at`. Coleta direta registra SHA-256 do HTML; leitura pública registra `collection_method=verified_public_web` e SHA-256 do snapshot extraído. As células verificadas ficam em `data/snapshots/`, com revisões no Git.

## Qualidade e limites

O CSV histórico não traz metadados completos de datum, consistência ou mudanças da régua. A tabela atual informa Ponte Marechal Rondon em Cáceres. Não foi verificada a equivalência do ponto/zero com todo o histórico. Portanto, o histórico e o acompanhamento novo **não são concatenados para tendências ou anomalias atuais**. O conjunto ANA de 2026 foi recuperado separadamente: 284 dias em Cáceres e Ladário, 249 em Porto Murtinho, na consulta de 11/10/2026. Porto Murtinho não retorna cotas após 06/09 nessa API. Cinco pontos SGB de setembro/outubro são identificados à parte. Os dias ausentes não são preenchidos. Veja [DADOS_2026.md](DADOS_2026.md) para cobertura, frequências e reprodução.

Cada cota é referida ao zero local: não equivale a profundidade, vazão ou área inundada, e não pode ser comparada em magnitude entre estações como se compartilhassem um datum. Extremos são os observados na base, não recordes oficiais certificados. As interpretações ecológicas são contextos científicos, não medições de impacto. Nenhuma previsão ou alerta de emergência é gerado.

## Reprodução

Python 3.12, somente biblioteca padrão. Node 20+ para testes dos cálculos da interface.

```sh
python scripts/build_stats.py
python scripts/build_overview.py
node scripts/build_dashboard.mjs
python -m unittest discover -s tests -v
node --test tests/*.test.js
python scripts/update_data.py
python scripts/update_telemetry.py --recent --output data/telemetry-daily.json --csv data/telemetry-daily.csv
# Complemento a partir de recuperação real da tabela pública:
python scripts/import_verified.py CAMINHO_SNAPSHOT.json
```

`index.html` e `dashboard.js` são gerados: editar `dashboard.template.html`, `dashboard-core.js`, `comparison-core.js` e `dashboard-client.js`, depois executar `npm run build`. O build não busca novos dados. O histórico compacto está em `data/overview.json`. A tarefa diária continua publicando somente os feeds; a página os consulta sem precisar regenerar o HTML. Sem JavaScript ou sem conexão, a data da cópia preservada continua explícita.

Para abrir em ambiente próprio, servir a pasta por HTTP. A página principal já contém os gráficos, mas consultas de dados e módulos da página de análises requerem HTTP.

## Créditos

Idealização: **Ernandes Sobreira**. Dados hidrométricos: **ANA, Marinha do Brasil e SGB**. Organização da base histórica: **Claumir Cesar Muniz, Derick Victor de Souza Campos e Wilkinson Kiwi Lopes Lázaro**.
