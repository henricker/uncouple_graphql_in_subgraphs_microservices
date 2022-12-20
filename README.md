## Desacoplando monolito em graphQL para pequenos microserviços

- Na pasta monolito está o nosso grandioso!, por ele estar bem grandinho é necessário aquela refatorada braba para separarmos alguns serviços de domínio e deixar o código mais fácil de manter e evoluir.

- Na pasta subgraphs está os nossos microserviços em graphql que estão sendo aos poucos desacoplados do monolito.

- Na pasta router possui o nosso gateway que é responsável por fazer a rotação dos nossos microserviços e também fazer a integração com o monolito.

- Por se tratar de uma aplicação para fins de estudo, considere que a pasta service possuem apis, bancos de dados onde os microserviços utilizam para fazer a persistência de dados.


## Até agora já desacoplamos
- [x] - Accounts 
- [x] - Reviews