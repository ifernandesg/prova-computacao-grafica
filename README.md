# Corrida Paramétrica 3D — Bézier vs B-Spline  
### Prova Prática — Computação Gráfica (FUCAPI)

Este projeto implementa uma simulação 3D interativa utilizando **p5.js + WEBGL**, apresentando comparação entre curvas paramétricas (Bézier e B-Spline), câmeras distintas e objetos paramétricos seguindo a pista.  
O trabalho atende a todos os itens obrigatórios do roteiro.

## 1. Tecnologias Utilizadas
- JavaScript
- p5.js (WEBGL)
- Curvas Bézier cúbicas
- Curvas B-Spline cúbicas

## 2. Objetivo
Criar uma corrida paramétrica 3D com:
- Pista paramétrica
- Carro seguindo a curva
- Câmera principal em modo *perspective*
- Mini-mapa em modo *orthographic*
- Checkpoints, voltas e HUD
- Objetos estáticos no cenário
- Comparação entre Bézier e B-Spline

## 3. Como Executar
### 1. Baixe ou clone o repositório:
```bash
git clone https://github.com/SEU-USUARIO/seu-repositorio.git
```

### 2. Execute:
Basta abrir o arquivo:
```
index.html
```

## 4. Controles

### Movimentação
| Tecla | Função |
|-------|--------|
| ↑ | Acelerar (aumenta velocidade paramétrica) |
| ↓ | Frear |
| ← / → | Offset lateral da câmera |
| Roda do mouse | Zoom da câmera |

### Visualização / Renderização
| Tecla | Função |
|-------|--------|
| Q | Alternar wireframe |
| Z | Alternar shading (flat / phong simulado) |
| C | Alternar tipo da pista (Bézier / B-Spline) |
| P | Mostrar/ocultar pontos de controle |
| X | Mostrar/ocultar eixos |
| T | Ativar/desativar textura da pista |
| F | Ativar/desativar frustum culling |
| H | Mostrar/ocultar HUD |

## 5. Funcionalidades Implementadas

### ✔ Pista paramétrica (Bézier e B-Spline)
### ✔ Carro paramétrico
### ✔ Câmera principal (perspective)
### ✔ Mini-mapa (orthographic)
### ✔ Checkpoints e voltas
### ✔ Pista texturizada
### ✔ Objetos estáticos no cenário
### ✔ HUD completo

## 6. Captura de Tela
Adicione sua captura na pasta `/docs`.

## 7. Estrutura do Projeto
```
/
├── index.html
├── README.md
└── src/
    ├── sketch.js
    ├── asphalt.png
    └── ...
```

## 8. Autor
**Lívia Gonçalves**  
Disciplina: Computação Gráfica — FUCAPI

## 9. Licença
Projeto acadêmico. Uso livre para fins educacionais.
