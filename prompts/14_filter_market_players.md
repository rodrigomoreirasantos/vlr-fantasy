## Visao Geral

 Para o mercado do plano .claude\plans\11-mercado-sempre-atualizado.md o filtro de players deve ser com base nos jogos pois players que pertecem a times onde o mercado ja foi encerrado nao deveria permitir que esse player seja escalado. Assim o filtro de players deve ser com base primeiro em saber se o mercado para ele esta aberto e caso esteja ele aparece no mercado.

## Task SESSAO SALDO/VAGA/MERCADO

- Unica informacao que nao seria relevante seria o saldo atuado do usuario para saber se ele pode ou nao contratar o player
- Pense na experiencia do usuario para criar as outras informacoes, pode remover VAGA e MERCADO, no lugar colocar algo que seja relevante para o usuario como experiencia
- Pensando na experiencia do usuario traga informacoes importantes pensando em como o app é

## Task SESSAO JOGADORES

- **SEMPRE** o player se deve a primeiro saber se o mercado do time em que ele joga esta aberto
- Caso o mercado dele estiver fechado o player nao deve aparecer na lista do mercado deve aparecer como bloqueado impedindo a escalação
- Se o mercado para aquele player estiver aberto o player deve aparecer no mercado
- A ordem do player deve ser em ordem de preco sendo do mais caro para o mais barato

## Task Filtro de players

- Caso o usuario saiba o nome do player deve ser possivel realizar a busca pelo nome do player
- O input de filtro pode ficar logo abaixo de TABS DE FUNÇÃO DE PLAYER
- O input de filtro deve realizar a ação nos cards dos jogadores sempre que o usuario digitar uma letra na busca, ou seja sempre que o usuario digitar deve atualizar os cards de players que aparecem para ele conforme ele vai digitando ate encontrar o player que busca
