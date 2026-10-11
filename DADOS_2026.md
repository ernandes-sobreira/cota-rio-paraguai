# Dados de 2026: origem e reprodução

A recuperação inicial da V2.2 substituiu o gráfico com uma única observação por um conjunto recuperado do serviço público da ANA. A cópia inicial, consultada em 11/10/2026, contém 64.320 registros originais com cota e 817 combinações estação/dia. Não são dados simulados nem cotas reconstruídas pela variação publicada.

| Local | Código ANA | Dias | Período observado | Registros |
| --- | --- | ---: | --- | ---: |
| Cáceres | 66070004 | 284 | 01/01–11/10/2026 | 26.967 |
| Ladário | 66825000 | 284 | 01/01–11/10/2026 | 26.898 |
| Porto Murtinho | 67100000 | 249 | 01/01–06/09/2026 | 10.455 |

A cobertura acima descreve a cópia inicial. O feed vivo pode incorporar novas observações e revisões da fonte. O dia da consulta é parcial: inicialmente, 37 registros entre 00h e 09h para Cáceres e Ladário, nos horários escritos pela fonte.

## API e arquivos

Serviço oficial: https://telemetriaws1.ana.gov.br/ServiceANA.asmx?op=DadosHidrometeorologicos

Parâmetros: `codEstacao`, `dataInicio` e `dataFim` em DD/MM/AAAA. A recuperação inicial usou uma consulta por estação/mês. A API legada estava respondendo sem chave na coleta; a ANA anuncia migração em https://telemetriaws1.ana.gov.br/Dados.aspx . O painel não garante a permanência desse serviço. Se deixar de responder, o coletor preserva os dados e sinaliza falha; a integração deverá ser adaptada ao serviço oficial sucessor.

- `data/telemetry-daily.json`: estatísticas por dia, contagem, primeiro/último horário, frequência, dia parcial, código e procedência de cada observação agregada.
- `data/telemetry-daily.csv`: exportação tabular, com a mesma unidade e sem preencher lacunas.
- `data/snapshots/ana-2026-10-11.tar.gz`: 30 respostas XML originais, manifesto com URLs e SHA-256, e JSON congelado da recuperação inicial. Os testes recalculam todos os 817 dias a partir desses XMLs.
- `scripts/update_telemetry.py`: coletor e agregador sem dependências externas. `--recent` consulta os meses que abrangem os últimos 40 dias para incorporar revisões. `--year 2026` permite recuperar o ano.

```sh
python scripts/update_telemetry.py --year 2026 --output data/telemetry-daily.json --csv data/telemetry-daily.csv
python -m unittest discover -s tests -v
```

## O que os números representam

O campo `Nivel` original é em centímetros; o painel divide por 100 para exibir metros. Campos vazios e sentinelas não viram zero. Registros duplicados idênticos são deduplicados; conflitos são rejeitados.

A frequência varia entre estações e períodos: Cáceres e Ladário têm predominantemente registros de 15 em 15 minutos. Porto Murtinho inclui 127 dias com registros às 07h e 17h. Não se atribui a todos os registros uma frequência fixa nem um mesmo método de observação.

O XML não declara o fuso de `DataHora`. A agregação usa a data escrita na fonte, sem conversão de fuso. O horário da consulta é separado do horário de observação. Datas e horários de consulta são registrados em UTC e exibidos como MT quando indicado.

A média de um dia é a média aritmética dos registros disponíveis, sem ponderação por duração. Mínima e máxima são extremos desses registros. O desvio-padrão é amostral (n−1); com um registro, é nulo. Isso não garante uma média de todas as 24 horas. Os dias ausentes ficam ausentes. Nas faixas dos gráficos individuais, o desvio é **intradiário**; no resumo do cartão, é o desvio **entre as médias diárias**.

As réguas usam zeros locais distintos. A opção “Mudança desde o início” subtrai, de cada estação, sua própria média no primeiro dia/período comum aos locais selecionados. Não converte as cotas em altitude nem mede volume ou vazão. Não foi demonstrada a continuidade do datum entre ANA, Marinha atual e todo o CSV de 1966–2025; esses conjuntos não são concatenados para inferência.

## Lacuna de Porto Murtinho e complemento SGB

Após 06/09/2026, as respostas ANA consultadas não trazem cotas de Porto Murtinho, mesmo quando contêm outros campos. O gráfico interrompe a curva. A coleta automática continuará procurando dados nos meses recentes.

Cinco leituras da Tabela 1, página 1, de boletins oficiais do SGB foram verificadas visualmente: 09/09 (2,85 m), 16/09 (3,00 m), 23/09 (3,00 m), 30/09 (2,68 m) e 07/10 (2,85 m), todas às 07h, sem fuso especificado no boletim. URLs individuais, hashes dos PDFs e datas de verificação estão em `data/sgb-supplement.json`.

Esses pontos aparecem como losangos separados. Não entram nas médias ANA, não preenchem outros dias e não são ligados por linhas. O complemento SGB é uma recuperação documental desta versão; o agendamento automático abrange ANA e Marinha. A leitura pontual Marinha mais recente aparece como círculo laranja com sua data própria.

## Revisão V2.3

O histórico legado foi retirado dos cálculos após divergências. A base histórica atual é data/history-ana.csv, recuperada de HidroSerieHistorica (médias diárias publicadas, 1966–2025). A telemetria de 2026 continua separada. A recuperação nesta sessão atualizou Cáceres e Ladário; Porto Murtinho continua sem cotas ANA posteriores a 06/09/2026. Consulte AUDITORIA.md.
