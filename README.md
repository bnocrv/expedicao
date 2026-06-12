# Painel de Expedição - Fina Estampa

Dashboard estático criado com HTML, CSS e JavaScript a partir da planilha
`Controle de Expedição.xlsx`.

## Acesso

Com o Laragon iniciado, abra:

`http://localhost/expedicao/`

## Atualização dos dados

Quando a planilha for atualizada, execute no PowerShell:

```powershell
cd C:\laragon\www\expedicao
python .\scripts\extract_data.py "C:\Users\bruno.carvalho\Desktop\Controle de Expedição.xlsx" ".\data\expeditions.js"
```

Depois, basta atualizar a página no navegador.

## Deploy

O painel é totalmente estático. Para publicar, envie estes itens mantendo a
mesma estrutura:

- `index.html`
- `assets/`
- `css/`
- `data/`
- `js/`

O diretório `scripts/` é necessário somente para atualizar os dados localmente
e não precisa ser publicado.

## Critérios

- Cada linha válida da planilha representa um carro expedido.
- Linhas completamente idênticas, incluindo número, horário e transferência,
  são tratadas como duplicidades e entram apenas uma vez.
- Os volumes compostos, como `91 & 129`, são somados.
- Viagens com mais de uma loja continuam contando como um único carro.
- Destinos combinados são separados somente no ranking por loja.
- Motoristas e veículos entre parênteses não fazem parte do nome do destino.
- Agosto e setembro de 2024 ficam em branco nas análises devido ao período
  de transição na expedição.
- No mês atual da base, o painel inicia comparando todos os anos até o mesmo
  dia para evitar confrontar um mês parcial com meses completos.

## Auditoria

Cada importação gera `data/audit.json` com totais mensais, duplicidades
removidas e linhas que exigem mapeamento explícito de volumes por loja.

Para validar a base gerada:

```powershell
python .\scripts\verify_data.py .\data\expeditions.js
```
