/**
 * GERADO por scripts/preparar-corpos.mjs — nao editar a mao.
 *
 * As pecas de cada personagem do pack, por familia, e a faixa de altura que
 * cada uma ocupa no corpo em repouso (metros), e o material que muda de cor
 * quando o jogador pinta a peca. Ver `corpos.ts`.
 */
export const CATALOGO_DE_CORPOS = {
  masculino: {
    base: 'worker',
    fontes: {
      adventurer: {
        arquivo: 'masculino-adventurer',
        partes: {
          tronco: {
            malha: 'Adventurer_Body',
            y: [
              0.99,
              1.557
            ],
            materiais: [
              'Skin',
              'Green',
              'LightGreen'
            ],
            principal: 'Green'
          },
          pes: {
            malha: 'Adventurer_Feet',
            y: [
              -0.001,
              0.22
            ],
            materiais: [
              'Grey',
              'Black'
            ],
            principal: 'Grey'
          },
          cabeca: {
            malha: 'Adventurer_Head',
            y: [
              1.442,
              1.856
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Hair',
              'Eye'
            ],
            principal: null
          },
          pernas: {
            malha: 'Adventurer_Legs',
            y: [
              0.137,
              1.034
            ],
            materiais: [
              'Brown',
              'Brown2'
            ],
            principal: 'Brown'
          },
          acessorio: {
            malha: 'Backpack',
            y: [
              1.181,
              1.59
            ],
            materiais: [
              'Brown',
              'LightGreen',
              'Gold',
              'Green'
            ],
            principal: 'LightGreen'
          }
        }
      },
      beach: {
        arquivo: 'masculino-beach',
        partes: {
          tronco: {
            malha: 'Beach_Body',
            y: [
              1.021,
              1.544
            ],
            materiais: [
              'Skin',
              'LightBrown'
            ],
            principal: 'LightBrown'
          },
          pes: {
            malha: 'Beach_Feet',
            y: [
              -0.005,
              0.162
            ],
            materiais: [
              'Skin',
              'Red_Dark'
            ],
            principal: 'Red_Dark'
          },
          cabeca: {
            malha: 'Beach_Head',
            y: [
              1.441,
              1.878
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Eye',
              'Hair',
              'Earrings'
            ],
            principal: 'Earrings'
          },
          pernas: {
            malha: 'Beach_Legs',
            y: [
              0.157,
              1.038
            ],
            materiais: [
              'Skin',
              'Red_Dark',
              'White'
            ],
            principal: 'Red_Dark'
          }
        }
      },
      casual_2: {
        arquivo: 'masculino-casual_2',
        partes: {
          tronco: {
            malha: 'Casual2_Body',
            y: [
              1.022,
              1.557
            ],
            materiais: [
              'Skin',
              'LightBrown'
            ],
            principal: 'LightBrown'
          },
          pes: {
            malha: 'Casual2_Feet',
            y: [
              -0.001,
              0.244
            ],
            materiais: [
              'Red_Dark',
              'White'
            ],
            principal: 'Red_Dark'
          },
          cabeca: {
            malha: 'Casual2_Head',
            y: [
              1.505,
              1.857
            ],
            materiais: [
              'Skin',
              'Skin_Darker',
              'Eyebrows',
              'Hair',
              'Eye'
            ],
            principal: null
          },
          pernas: {
            malha: 'Casual2_Legs',
            y: [
              0.132,
              1.036
            ],
            materiais: [
              'LightBlue'
            ],
            principal: 'LightBlue'
          }
        }
      },
      casual_hoodie: {
        arquivo: 'masculino-casual_hoodie',
        partes: {
          tronco: {
            malha: 'Casual_Body',
            y: [
              1.004,
              1.574
            ],
            materiais: [
              'Skin',
              'Purple'
            ],
            principal: 'Purple'
          },
          pes: {
            malha: 'Casual_Feet',
            y: [
              -0.004,
              0.134
            ],
            materiais: [
              'Purple',
              'White'
            ],
            principal: 'White'
          },
          cabeca: {
            malha: 'Casual_Head',
            y: [
              1.499,
              1.866
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Eye',
              'Hair'
            ],
            principal: null
          },
          pernas: {
            malha: 'Casual_Legs',
            y: [
              0.124,
              1.045
            ],
            materiais: [
              'Skin',
              'LightBlue'
            ],
            principal: 'LightBlue'
          }
        }
      },
      farmer: {
        arquivo: 'masculino-farmer',
        partes: {
          tronco: {
            malha: 'Farmer_Body',
            y: [
              1,
              1.555
            ],
            materiais: [
              'Skin',
              'LightBlue',
              'Brown',
              'Beige'
            ],
            principal: 'Brown'
          },
          pes: {
            malha: 'Farmer_Feet',
            y: [
              0,
              0.212
            ],
            materiais: [
              'Brown',
              'Brown2'
            ],
            principal: 'Brown'
          },
          cabeca: {
            malha: 'Farmer_Head',
            y: [
              1.455,
              1.856
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Beige',
              'Red',
              'Eye'
            ],
            principal: 'Beige'
          },
          pernas: {
            malha: 'Farmer_Pants',
            y: [
              0.124,
              1.037
            ],
            materiais: [
              'LightBlue'
            ],
            principal: 'LightBlue'
          }
        }
      },
      king: {
        arquivo: 'masculino-king',
        partes: {
          tronco: {
            malha: 'King_Body',
            y: [
              0.986,
              1.564
            ],
            materiais: [
              'Skin',
              'Blue',
              'Metal',
              'Beige',
              'Metal_Dark'
            ],
            principal: 'Metal'
          },
          pes: {
            malha: 'King_Feet',
            y: [
              -0.001,
              0.228
            ],
            materiais: [
              'Metal'
            ],
            principal: 'Metal'
          },
          cabeca: {
            malha: 'King_Head',
            y: [
              1.47,
              1.903
            ],
            materiais: [
              'Skin',
              'Hair_White',
              'Gold',
              'Eye'
            ],
            principal: 'Gold'
          },
          pernas: {
            malha: 'King_Legs',
            y: [
              0.139,
              1.037
            ],
            materiais: [
              'DarkBrown',
              'Metal',
              'Metal_Dark'
            ],
            principal: 'DarkBrown'
          }
        }
      },
      punk: {
        arquivo: 'masculino-punk',
        partes: {
          tronco: {
            malha: 'Punk_Body',
            y: [
              1.001,
              1.6
            ],
            materiais: [
              'Skin',
              'White',
              'Black'
            ],
            principal: 'Black'
          },
          pes: {
            malha: 'Punk_Feet',
            y: [
              -0.004,
              0.201
            ],
            materiais: [
              'Skin',
              'Black'
            ],
            principal: 'Black'
          },
          cabeca: {
            malha: 'Punk_Head',
            y: [
              1.439,
              1.965
            ],
            materiais: [
              'Skin',
              'Eye',
              'Eyebrows',
              'Red_Dark',
              'Red',
              'Earrings'
            ],
            principal: 'Red'
          },
          pernas: {
            malha: 'Punk_Legs',
            y: [
              0.122,
              1.039
            ],
            materiais: [
              'Skin',
              'LightBlue'
            ],
            principal: 'LightBlue'
          }
        }
      },
      spacesuit: {
        arquivo: 'masculino-spacesuit',
        partes: {
          tronco: {
            malha: 'SpaceSuit_Body',
            y: [
              0.994,
              1.586
            ],
            materiais: [
              'SciFi_Light',
              'SciFi_Light_Accent',
              'SciFi_Main',
              'SciFi_MainDark'
            ],
            principal: 'SciFi_Light_Accent'
          },
          pes: {
            malha: 'SpaceSuit_Feet',
            y: [
              0,
              0.273
            ],
            materiais: [
              'SciFi_Light_Accent',
              'SciFi_Light'
            ],
            principal: 'SciFi_Light_Accent'
          },
          cabeca: {
            malha: 'SpaceSuit_Head',
            y: [
              1.427,
              1.886
            ],
            materiais: [
              'SciFi_Light',
              'SciFi_Light_Accent',
              'Grey'
            ],
            principal: 'SciFi_Light'
          },
          pernas: {
            malha: 'SpaceSuit_Legs',
            y: [
              0.221,
              1.032
            ],
            materiais: [
              'SciFi_Main',
              'SciFi_Light',
              'SciFi_Light_Accent',
              'SciFi_MainDark'
            ],
            principal: 'SciFi_MainDark'
          }
        }
      },
      suit: {
        arquivo: 'masculino-suit',
        partes: {
          tronco: {
            malha: 'Suit_Body',
            y: [
              1.02,
              1.559
            ],
            materiais: [
              'Skin',
              'Tie',
              'Suit',
              'White'
            ],
            principal: 'Suit'
          },
          pes: {
            malha: 'Suit_Feet',
            y: [
              -0.001,
              0.169
            ],
            materiais: [
              'Black'
            ],
            principal: 'Black'
          },
          cabeca: {
            malha: 'Suit_Head',
            y: [
              1.501,
              1.856
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Hair',
              'Eye'
            ],
            principal: null
          },
          pernas: {
            malha: 'Suit_Legs',
            y: [
              0.141,
              1.039
            ],
            materiais: [
              'Suit'
            ],
            principal: 'Suit'
          }
        }
      },
      swat: {
        arquivo: 'masculino-swat',
        partes: {
          tronco: {
            malha: 'Swat_Body',
            y: [
              1.03,
              1.58
            ],
            materiais: [
              'Skin',
              'Swat',
              'Swat_Black'
            ],
            principal: 'Swat_Black'
          },
          pes: {
            malha: 'Swat_Feet',
            y: [
              -0.001,
              0.287
            ],
            materiais: [
              'Swat_Black'
            ],
            principal: 'Swat_Black'
          },
          cabeca: {
            malha: 'Swat_Head',
            y: [
              1.482,
              1.852
            ],
            materiais: [
              'Swat_Black',
              'Swat',
              'Visor'
            ],
            principal: 'Swat_Black'
          },
          pernas: {
            malha: 'Swat_Legs',
            y: [
              0.22,
              1.059
            ],
            materiais: [
              'Swat',
              'Swat_Black'
            ],
            principal: 'Swat'
          }
        }
      },
      worker: {
        arquivo: 'masculino-worker',
        partes: {
          tronco: {
            malha: 'Worker_Body',
            y: [
              1.009,
              1.557
            ],
            materiais: [
              'Skin',
              'Worker_Yellow',
              'Worker_Vest',
              'LightBrown'
            ],
            principal: 'Worker_Vest'
          },
          pes: {
            malha: 'Worker_Feet',
            y: [
              -0.004,
              0.273
            ],
            materiais: [
              'Grey',
              'Black'
            ],
            principal: 'Grey'
          },
          cabeca: {
            malha: 'Worker_Head',
            y: [
              1.455,
              1.863
            ],
            materiais: [
              'Skin',
              'Eyebrows',
              'Worker_Yellow',
              'Moustache',
              'Eye'
            ],
            principal: 'Worker_Yellow'
          },
          pernas: {
            malha: 'Worker_Legs',
            y: [
              0.137,
              1.039
            ],
            materiais: [
              'Brown',
              'Brown2'
            ],
            principal: 'Brown'
          }
        }
      }
    }
  },
  feminino: {
    base: 'worker',
    fontes: {
      adventurer: {
        arquivo: 'feminino-adventurer',
        partes: {
          tronco: {
            malha: 'Adventurer_Body',
            y: [
              1.119,
              1.569
            ],
            materiais: [
              'Skin',
              'White',
              'Brown2',
              'LightGreen',
              'Gold',
              'Green'
            ],
            principal: 'LightGreen'
          },
          pes: {
            malha: 'Adventurer_Feet',
            y: [
              -0.001,
              0.437
            ],
            materiais: [
              'Brown_02',
              'Brown2'
            ],
            principal: 'Brown_02'
          },
          cabeca: {
            malha: 'Adventurer_Head',
            y: [
              1.538,
              1.828
            ],
            materiais: [
              'Skin',
              'Hair_Brown',
              'Brown'
            ],
            principal: 'Brown'
          },
          pernas: {
            malha: 'Adventurer_Legs',
            y: [
              0.364,
              1.186
            ],
            materiais: [
              'Skin',
              'Brown_02',
              'White',
              'Brown2',
              'LightGreen',
              'Gold'
            ],
            principal: 'Brown_02'
          }
        }
      },
      casual: {
        arquivo: 'feminino-casual',
        partes: {
          tronco: {
            malha: 'Casual_Body',
            y: [
              1.094,
              1.541
            ],
            materiais: [
              'Skin',
              'White'
            ],
            principal: 'White'
          },
          pes: {
            malha: 'Casual_Feet',
            y: [
              -0.009,
              0.184
            ],
            materiais: [
              'Skin',
              'Grey'
            ],
            principal: 'Grey'
          },
          cabeca: {
            malha: 'Casual_Head',
            y: [
              1.523,
              1.843
            ],
            materiais: [
              'Skin',
              'Hair_Brown',
              'Brown',
              'Hair_Blond'
            ],
            principal: 'Brown'
          },
          pernas: {
            malha: 'Casual_Legs',
            y: [
              0.146,
              1.134
            ],
            materiais: [
              'Orange'
            ],
            principal: 'Orange'
          }
        }
      },
      formal: {
        arquivo: 'feminino-formal',
        partes: {
          cabeca: {
            malha: 'Formad_Head',
            y: [
              1.525,
              1.844
            ],
            materiais: [
              'Skin',
              'Brown',
              'Red'
            ],
            principal: 'Red'
          },
          tronco: {
            malha: 'Formal_Body',
            y: [
              1.12,
              1.541
            ],
            materiais: [
              'Skin',
              'LimeGreen',
              'Gold'
            ],
            principal: 'LimeGreen'
          },
          pes: {
            malha: 'Formal_Feet',
            y: [
              0.001,
              0.182
            ],
            materiais: [
              'Skin',
              'Red'
            ],
            principal: 'Red'
          },
          pernas: {
            malha: 'Formal_Legs',
            y: [
              0.179,
              1.132
            ],
            materiais: [
              'Skin',
              'LimeGreen'
            ],
            principal: 'LimeGreen'
          }
        }
      },
      medieval: {
        arquivo: 'feminino-medieval',
        partes: {
          tronco: {
            malha: 'Medieval_Body',
            y: [
              1.059,
              1.554
            ],
            materiais: [
              'Skin',
              'DarkBrown',
              'Gold',
              'LightBrown',
              'Black',
              'Metal'
            ],
            principal: 'DarkBrown'
          },
          pes: {
            malha: 'Medieval_Feet',
            y: [
              0,
              0.458
            ],
            materiais: [
              'DarkBrown',
              'LightBrown'
            ],
            principal: 'DarkBrown'
          },
          cabeca: {
            malha: 'Medieval_Head',
            y: [
              1.521,
              1.877
            ],
            materiais: [
              'Skin',
              'White',
              'Brown',
              'DarkBrown',
              'Black'
            ],
            principal: 'DarkBrown'
          },
          pernas: {
            malha: 'Medieval_Legs',
            y: [
              0.345,
              1.137
            ],
            materiais: [
              'Black'
            ],
            principal: 'Black'
          }
        }
      },
      punk: {
        arquivo: 'feminino-punk',
        partes: {
          tronco: {
            malha: 'Punk_Body',
            y: [
              1.12,
              1.54
            ],
            materiais: [
              'Skin',
              'Pink',
              'Black'
            ],
            principal: 'Pink'
          },
          pes: {
            malha: 'Punk_Feet',
            y: [
              0.002,
              0.429
            ],
            materiais: [
              'Black',
              'Grey'
            ],
            principal: 'Black'
          },
          cabeca: {
            malha: 'Punk_Head',
            y: [
              1.539,
              1.96
            ],
            materiais: [
              'Skin',
              'Pink',
              'Black',
              'Hair_Brown',
              'Brown'
            ],
            principal: 'Pink'
          },
          pernas: {
            malha: 'Punk_Legs',
            y: [
              0.372,
              1.125
            ],
            materiais: [
              'Skin',
              'Black'
            ],
            principal: 'Black'
          }
        }
      },
      scifi: {
        arquivo: 'feminino-scifi',
        partes: {
          tronco: {
            malha: 'SciFi_Body',
            y: [
              1.124,
              1.542
            ],
            materiais: [
              'Skin',
              'Black',
              'Metal',
              'LightBlue',
              'Blue'
            ],
            principal: 'Black'
          },
          pes: {
            malha: 'SciFi_Feet',
            y: [
              0,
              0.53
            ],
            materiais: [
              'Black',
              'Metal'
            ],
            principal: 'Metal'
          },
          cabeca: {
            malha: 'SciFi_Head',
            y: [
              1.538,
              1.854
            ],
            materiais: [
              'Skin',
              'Black',
              'Brown',
              'Hair_Black',
              'Blue'
            ],
            principal: 'Blue'
          },
          pernas: {
            malha: 'SciFi_Legs',
            y: [
              0.433,
              1.134
            ],
            materiais: [
              'Black',
              'Metal',
              'LightBlue'
            ],
            principal: 'Black'
          }
        }
      },
      soldier: {
        arquivo: 'feminino-soldier',
        partes: {
          tronco: {
            malha: 'Soldier_Body',
            y: [
              1.132,
              1.548
            ],
            materiais: [
              'Black',
              'Swat',
              'Skin'
            ],
            principal: 'Black'
          },
          pes: {
            malha: 'Soldier_Feet',
            y: [
              -0.001,
              0.429
            ],
            materiais: [
              'Grey',
              'Black'
            ],
            principal: 'Grey'
          },
          cabeca: {
            malha: 'Soldier_Head',
            y: [
              1.538,
              1.829
            ],
            materiais: [
              'Skin',
              'Hair_Brown',
              'Brown'
            ],
            principal: 'Brown'
          },
          pernas: {
            malha: 'Soldier_Legs',
            y: [
              0.333,
              1.154
            ],
            materiais: [
              'Grey',
              'Black',
              'Swat'
            ],
            principal: 'Swat'
          }
        }
      },
      suit: {
        arquivo: 'feminino-suit',
        partes: {
          tronco: {
            malha: 'Suit_Body',
            y: [
              1.131,
              1.541
            ],
            materiais: [
              'Skin',
              'Black',
              'White'
            ],
            principal: 'Black'
          },
          pes: {
            malha: 'Suit_Feet',
            y: [
              -0.002,
              0.192
            ],
            materiais: [
              'Skin',
              'Black'
            ],
            principal: 'Black'
          },
          cabeca: {
            malha: 'Suit_Head',
            y: [
              1.523,
              1.843
            ],
            materiais: [
              'Skin',
              'Hair_Brown',
              'Brown',
              'Hair_Blond'
            ],
            principal: 'Brown'
          },
          pernas: {
            malha: 'Suit_Legs',
            y: [
              0.148,
              1.159
            ],
            materiais: [
              'Black'
            ],
            principal: 'Black'
          }
        }
      },
      witch: {
        arquivo: 'feminino-witch',
        partes: {
          tronco: {
            malha: 'Witch_Body',
            y: [
              1.131,
              1.541
            ],
            materiais: [
              'Skin',
              'Brown2',
              'Purple',
              'Gold'
            ],
            principal: 'Purple'
          },
          pes: {
            malha: 'Witch_Feet',
            y: [
              0,
              0.458
            ],
            materiais: [
              'Brown2'
            ],
            principal: 'Brown2'
          },
          cabeca: {
            malha: 'Witch_Head',
            y: [
              1.479,
              2.045
            ],
            materiais: [
              'Skin',
              'Purple',
              'Brown',
              'Gold',
              'Hair_Black'
            ],
            principal: 'Purple'
          },
          pernas: {
            malha: 'Witch_Legs',
            y: [
              0.386,
              1.135
            ],
            materiais: [
              'Purple',
              'Brown',
              'Gold'
            ],
            principal: 'Brown'
          }
        }
      },
      worker: {
        arquivo: 'feminino-worker',
        partes: {
          tronco: {
            malha: 'Worker_Body',
            y: [
              1.146,
              1.541
            ],
            materiais: [
              'Skin',
              'Worker_Vest',
              'White',
              'Worker_Yellow'
            ],
            principal: 'White'
          },
          pes: {
            malha: 'Worker_Feet',
            y: [
              -0.002,
              0.197
            ],
            materiais: [
              'Skin',
              'Black'
            ],
            principal: 'Black'
          },
          cabeca: {
            malha: 'Worker_Head',
            y: [
              1.538,
              1.859
            ],
            materiais: [
              'Skin',
              'DarkBrown',
              'Brown',
              'Worker_Yellow'
            ],
            principal: 'DarkBrown'
          },
          pernas: {
            malha: 'Worker_Legs',
            y: [
              0.146,
              1.154
            ],
            materiais: [
              'Brown_02',
              'Brown2'
            ],
            principal: 'Brown_02'
          }
        }
      }
    }
  }
} as const;
