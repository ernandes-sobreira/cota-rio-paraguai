# Cota Rio Paraguai · V2

Painel de cotas de Cáceres, Ladário e Porto Murtinho: https://ernandes-sobreira.github.io/cota-rio-paraguai/

Visual alinhado ao Chuva-MT: fundo claro, tipografia Sora/Source Sans 3, azul, verde e navegação responsiva. Implementação estática, sem dependências JavaScript externas, chaves no navegador ou dados sintéticos.

## Funcionalidades

- Últimas leituras publicadas, datas individuais, variação informada pela Marinha e situação da consulta.
- Arquivo diário incremental e gráfico recente; regressão descritiva somente após dados suficientes.
- Histórico diário original, de 01/01/1966 a 26/12/2025: 65.257 observações, preservadas sem alterações.
- Recortes, médias/mínimas/máximas mensais e anuais, dispersão, percentis e cobertura.
- Sazonalidade 1991–2020 (mediana e P10–P90), comparação de dois anos.
- Tendência linear, R² e inclinação de Sen; ≥90% de cobertura anual e no mínimo dez anos elegíveis. Mann–Kendall exploratório sem correção de autocorrelação no arquivo JSON.
- Downloads CSV/JSON e gráficos SVG; contextos ecológicos e humanos com referências da Embrapa e Marinha.
- Versão anterior conservada em `versao-anterior.html`.

## Atualização automática

Leia [ATUALIZACAO.md](ATUALIZACAO.md). Coleta direta no GitHub Actions às 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4); pode atrasar. Em 11/10/2026 a fonte recusou essa coleta com HTTP 403. Foi ativada também uma tarefa agendada do ChatGPT, pela manhã e à tarde, para consultar a tabela pública oficial e publicar os dados via API do GitHub. Essa tarefa depende de permanecer ativa e de manter o acesso conectado ao GitHub e à leitura pública. Não requer chave paga da Marinha. O workflow usa o `GITHUB_TOKEN` automático do repositório.

O feed JSON é próprio do projeto, **não uma API oficial da Marinha**:

- `https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/latest.json`
- `https://raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/daily.json`

A interface busca os feeds ao abrir, ao clicar em atualizar e a cada 15 minutos enquanto está visível. O agendamento funciona com o site fechado. Em caso de falha remota, usa a cópia local e mostra essa situação. Não depender de commits do `GITHUB_TOKEN` dispararem um build do Pages: a consulta ao feed raw é independente.

### Esquema de observação

`station`, `date` (AAAA-MM-DD), `level_m`, `variation_m` (pode ser null), `source_url`, `observation`, `measurement_time` (null quando não informado), `collected_at`. Coleta direta registra SHA-256 do HTML; leitura pública registra `collection_method=verified_public_web` e SHA-256 do snapshot extraído. As células verificadas ficam em `data/snapshots/`, com revisões no Git.

## Qualidade e limites

O CSV histórico não traz metadados completos de datum, consistência ou mudanças da régua. A tabela atual informa Ponte Marechal Rondon em Cáceres. Não foi verificada a equivalência do ponto/zero com todo o histórico. Portanto, o histórico e o acompanhamento novo **não são concatenados para tendências ou anomalias atuais**. A lacuna de 27/12/2025 a 10/10/2026 permanece sem preenchimento.

Cada cota é referida ao zero local: não equivale a profundidade, vazão ou área inundada, e não pode ser comparada em magnitude entre estações como se compartilhassem um datum. Extremos são os observados na base, não recordes oficiais certificados. As interpretações ecológicas são contextos científicos, não medições de impacto. Nenhuma previsão ou alerta de emergência é gerado.

## Reprodução

Python 3.12, somente biblioteca padrão. Node 20+ para testes dos cálculos da interface.

```sh
python scripts/build_stats.py
python -m unittest discover -s tests -v
node --test tests/math.test.js
python scripts/update_data.py
# Complemento a partir de recuperação real da tabela pública:
python scripts/import_verified.py CAMINHO_SNAPSHOT.json
```

Para abrir em ambiente próprio, servir a pasta por HTTP; módulos JavaScript e fetch não funcionam de forma confiável por `file://`.

## Créditos

Idealização: **Ernandes Sobreira**. Dados hidrométricos: **Marinha do Brasil**. Organização da base histórica: **Claumir Cesar Muniz, Derick Victor de Souza Campos e Wilkinson Kiwi Lopes Lázaro**.
