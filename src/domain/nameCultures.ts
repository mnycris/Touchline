// Name pools by naming culture, for players the game creates (academy prospects, youth intakes, staff). Each nation
// draws on one or more cultures in realistic proportions (an English academy is not all Smiths and Joneses, a French
// one has many names with roots in West and North Africa), and each culture has its own way of writing a name.
// Lists run roughly from more to less common. Multi-word parts are joined with "_".

export type NameStyle = 'western' | 'iberian' | 'brazil' | 'family-first'

export interface Culture { first: string; last: string; style?: NameStyle; nick?: string; second?: boolean }

export const CULTURES: Record<string, Culture> = {
  en: {
    first: `Oliver Jack Harry George Noah Charlie Jacob Alfie Freddie Oscar Leo Archie Henry Joshua James Ethan Thomas William Logan Max Lucas Isaac Mason Harrison Theo Finley Riley Dylan Zachary Joseph Samuel Daniel Arthur Teddy Tommy Reggie Albie Ronnie Louie Kian Callum Kai Rory Ollie Sonny Frankie Toby Elliot Jude Bobby Billy Ellis Tyler Connor Owen Lewis Morgan Ben Luke Adam Nathan Liam Kyle Jamie Ryan Jordan Lennon Rio Myles Cole Carter Reece Harvey Stanley Hugo Jenson Ezra Marley Tobias Ashton Josh Joe Sam Alex Will Matt Harley Jayden Kobe Tate Jacob Alfred Ralph Brody Rocco Seb Fraser Jesse Alex Lucca Rafe`,
    last: `Smith Jones Williams Taylor Brown Davies Evans Wilson Thomas Johnson Roberts Robinson Thompson Wright Walker White Edwards Hughes Green Hall Lewis Harris Clarke Patel Jackson Wood Turner Martin Cooper Hill Ward Morris Moore Clark Lee King Baker Harrison Morgan Allen James Scott Phillips Watson Davis Parker Price Bennett Young Griffiths Mitchell Kelly Cook Carter Richardson Bailey Collins Bell Shaw Murphy Miller Cox Richards Khan Marshall Anderson Simpson Ellis Adams Wilkinson Foster Chapman Powell Webb Rogers Gray Mason Hunt Hussain Campbell Matthews Owen Palmer Holmes Mills Barnes Knight Lloyd Butler Russell Barker Fisher Stevens Jenkins Murray Dixon Harvey Graham Pearson Fletcher Walsh Gibson Howard Andrews Stewart Elliott Reynolds Saunders Payne Fox Ford Pearce Day Brooks West Lawrence Cole Atkinson Bradley Spencer Gill Dawson Ball Burton Watts Rose Booth Perry Grant Wells Armstrong Francis Hayes Hart Hudson Newman Barrett Webster Hunter Gregory Carr Lowe Page Marsh Riley Dunn Woods Parsons Berry Stone Reid Holland Hawkins Harding Porter Newton Oliver Reed Kennedy Williamson Bird Gardner Dean Lane Cooke Bates Henderson Parry Burgess Bishop Walton Burns Nicholson Shepherd Ross Cross Long Freeman Warren Nicholls Hamilton Sutton Yates Hodgson Robson Curtis Hopkins Harper Coleman Watkins Moss Chambers Griffin Austin Doyle Lowry Whitehead Sharp Blake Barlow Hammond Kirby Pickering Rhodes`,
  },
  gael: {
    first: `Callum Lewis Ross Euan Fraser Lachlan Calum Finlay Rory Kieran Cian Oisín Seán Darragh Conor Ronan Eoin Niall Fionn Tadhg Cillian Ciarán Liam Jack James Aaron Adam Dylan Evan Jamie Kyle Lucas Matthew Nathan Ryan Scott Shane Dara Senan Odhran Cormac Pádraig Ruairí Brodie Archie Harris Lennon Ewan Alfie Mason Ollie Fionn Daire Mikey`,
    last: `Murphy Kelly O'Sullivan Walsh O'Brien Byrne Ryan O'Connor O'Neill Doyle McCarthy Gallagher Doherty Kennedy Lynch Murray Quinn Moore McLaughlin Carroll Connolly Daly Connell Brennan Burke Collins Campbell Clarke Johnston Hughes Farrell Fitzgerald Maguire Nolan Flynn Callaghan Duffy Kavanagh Keane Hayes Higgins Power Dunne Reilly Sweeney Kane McGrath Boyle Molloy Kearney Cunningham Hegarty Brady Mulligan MacDonald MacLeod Fraser Stewart Robertson Thomson Anderson Scott Reid Ross Paterson Mackenzie Mackay Morrison Hamilton Graham Kerr Cameron Ferguson McIntyre Sinclair Wallace Gilmour McGinn Ralston Ferrie Henderson Christie Turnbull Forrest Hendry Docherty McKenna McCann Devlin Coyle Hanlon Kilkenny Considine`,
  },
  cymru: {
 first:`Rhys Dylan Gethin Ifan Osian Cai Tomos Iwan Owain Harri Morgan Elis Ioan Aled Jac Lewis Ethan Ryan Jordan Brennan Wes Joe Ben Sam Tom Charlie Harry Jack Callum Ollie`,
 last:`Jones Williams Davies Evans Thomas Roberts Hughes Lewis Morgan Griffiths Edwards Owen Price Jenkins Rees Lloyd Howells Powell Pritchard Vaughan Bowen Parry Pugh Prosser Llewellyn Harries Watkins Bevan Probert Gwilliam Rowlands Meredith Matthews Cadwallader`,
  },
  es: {
    first: `Hugo Martín Lucas Mateo Leo Daniel Alejandro Pablo Manuel Álvaro Adrián David Mario Diego Javier Marcos Izan Álex Bruno Oliver Miguel Thiago Antonio Marc Carlos Ángel Juan Gonzalo Gael Sergio Nicolás Jorge José Iker Rodrigo Héctor Samuel Rubén Iván Raúl Aitor Unai Asier Ander Jon Mikel Oier Eneko Pol Arnau Pau Jan Biel Nil Gerard Jordi Joan Aleix Rafael Fernando Andrés Víctor Óscar Alberto Luis Francisco Ignacio Jaime Fermín Pedro Gabriel Tomás Saúl Jesús Borja Guillermo Íñigo Alonso Enrique Julen Eric Roberto Juan_Carlos José_Luis Juan_Miguel Joel Marcel Rayan Yeray Aimar Adam`,
    last: `García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Gutiérrez Navarro Torres Domínguez Vázquez Ramos Gil Ramírez Serrano Blanco Molina Morales Suárez Ortega Delgado Castro Ortiz Rubio Marín Sanz Núñez Iglesias Medina Garrido Cortés Castillo Santos Lozano Guerrero Cano Prieto Méndez Cruz Calvo Gallego Vidal León Márquez Herrera Peña Flores Cabrera Campos Vega Fuentes Carrasco Díez Caballero Reyes Nieto Aguilar Pascual Santana Herrero Lorenzo Montero Hidalgo Giménez Ibáñez Ferrer Durán Santiago Benítez Mora Vicente Arias Vargas Carmona Crespo Román Pastor Soto Sáez Velasco Moya Soler Parra Esteban Bravo Gallardo Rojas Pardo Merino Franco Espinosa Izquierdo Lara Rivas Rivera Casado Arroyo Redondo Camacho Rey Vera Otero Luque Galán Montes Ríos Sierra Segura Carrillo Soriano Mendoza Robles Bernal Vila Aguirre Goikoetxea Urrutia Arrieta Etxeberria Mendizábal Puig Roca Serra Riera Bosch Pujol Font Sala Oyarzun Zabaleta Iturraspe Larrañaga`,
    style: 'iberian', second: true,
  },
  latam: {
 first:`Santiago Mateo Matías Sebastián Benjamín Martín Nicolás Thiago Joaquín Lucas Emiliano Felipe Tomás Agustín Facundo Franco Gonzalo Lautaro Valentín Bautista Ignacio Maximiliano Juan_Cruz Juan_Pablo Juan_José José Luis Carlos Jorge Diego Alejandro Andrés Camilo Kevin Brayan Jhon Jefferson Yeferson Cristian Daniel David Miguel Ángel Rodrigo Leonardo Fernando Gustavo Héctor Eduardo Ricardo Óscar Raúl Erick Jesús Alexis Brian Jonathan Marcelo Enzo Gianluca Nahuel Tiago Ezequiel Germán Hernán Lisandro Alexander Edinson Duván Yerson Wilmer Frank Josué Byron Jordy Moisés Elías Isaac Iker Dylan Luciano Thiago Bruno Valentino Benicio Alan Jairo Kendry Yeison Dairon Anderson Esteban`,
 last:`González Rodríguez Gómez Fernández López Díaz Martínez Pérez García Sánchez Romero Sosa Álvarez Torres Ruiz Ramírez Flores Benítez Acosta Medina Herrera Suárez Aguirre Giménez Gutiérrez Pereyra Rojas Molina Castro Ortiz Silva Núñez Luna Juárez Cabrera Ríos Ferreyra Godoy Morales Domínguez Moreno Peralta Vega Carrizo Quiroga Castillo Ledesma Muñoz Ojeda Ponce Vera Villalba Cardozo Navarro Coronel Vázquez Ramos Paz Figueroa Correa Cáceres Vargas Mendoza Ortega Ayala Valencia Mosquera Palacios Arboleda Murillo Hurtado Caicedo Mina Cuero Zapata Salazar Quintero Lucumí Cortés Montaño Hernández Jiménez Reyes Cruz Guerrero Espinoza Contreras Valdez Delgado Aguilar Estrada Cervantes Rosales Salinas Arellano Escobar Villarreal Solís Fuentes Bravo Tapia Sepúlveda Araya Vidal Sandoval Carrasco Pizarro Riquelme Bustos Orellana Valenzuela Quispe Mamani Huamán Chávez Paredes Alcívar Plata Preciado Estupiñán Bolaños Mejía Galeano Benavídez Insaurralde Zárate Alderete Barrios`,
 style: 'iberian', second: true,
  },
  pt: {
    first: `Francisco Afonso João Tomás Duarte Martim Santiago Rodrigo Lourenço Gonçalo Miguel Gabriel Rafael Salvador Guilherme Diogo Pedro Vicente Simão Gustavo Leonardo Dinis Henrique Tiago Bernardo David Manuel Lucas Mateus Daniel Vasco Rúben Nuno Ricardo André Bruno Fábio Hugo Luís Paulo Rui Sérgio Vítor Jorge Fernando Filipe Hélder Nélson Renato Gil Xavier Samuel Leandro Marco Carlos Alexandre Fausto Jaime Raúl Joaquim Edgar Telmo`,
    last: `Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Raposo Neves Coelho Cruz Cunha Pires Ramos Reis Simões Antunes Matos Fonseca Machado Araújo Barbosa Tavares Lourenço Castro Figueiredo Azevedo Freitas Silvestre Baptista Brito Paiva Guedes Leão Esteves Valente Morais Faria Lima Barros Magalhães Amaral Caldeira Seabra Sequeira Domingues Quintas Pacheco Borges Calado Veloso Brandão Campos Moura`,
    style: 'iberian',
  },
  br: {
 first:`Miguel Arthur Gael Heitor Theo Davi Gabriel Bernardo Samuel João_Pedro Pedro Lucas Matheus Enzo Rafael Gustavo Guilherme Felipe Vinícius Nicolas Lorenzo Murilo Henrique Leonardo Bruno Thiago Caio Igor Vitor Kauã Kaique Wesley Willian Yuri Breno Ruan Luan Erick Anderson Douglas Diego Danilo Éder Fábio Fabrício Raphael Renan Rian Ryan Juan Kevin Alisson Weverton Talles Pablo Paulo Marcos Marcelo Lucca Otávio Joaquim Benício Bento Isaac Antônio Emanuel Davi_Lucca Luiz_Felipe João_Vitor Pedro_Henrique Carlos_Eduardo Jhonatan Wellington Jefferson Yago Estêvão Endrick Matheus_Henrique Kauan Nathan`,
 last:`Silva Santos Oliveira Souza Rodrigues Ferreira Alves Pereira Lima Gomes Costa Ribeiro Martins Carvalho Almeida Lopes Soares Fernandes Vieira Barbosa Rocha Dias Nascimento Andrade Moreira Nunes Marques Machado Mendes Freitas Cardoso Ramos Gonçalves Santana Teixeira Araújo Moraes Campos Pinto Batista Correia Monteiro Reis Castro Cavalcanti Azevedo Rezende Farias Medeiros Siqueira Brandão Coelho Bezerra Queiroz Prado Fonseca Nogueira Guimarães Leite Tavares Barros Peixoto Xavier Sampaio Bastos Toledo Viana Duarte Pacheco Assis Matos Miranda Diniz Paiva Cunha Aguiar Porto Moura Lacerda Sales Bittencourt`,
 nick:`Vitinho Paulinho Juninho Pedrinho Luizinho Marquinhos Carlinhos Toninho Zezinho Bruninho Danilinho Rafinha Thiaguinho Guga Dudu Nenê Tetê Lelê Jajá Matheuzinho Gabrielzinho Davizinho Biel Tiquinho Netinho Juca Serginho Rodriguinho Gustavinho Cauãzinho Léo Pepê Tchê_Tchê Patrick Wendel Ademir Wanderson`,
 style: 'brazil',
  },
  it: {
    first: `Francesco Alessandro Lorenzo Leonardo Mattia Andrea Gabriele Riccardo Tommaso Edoardo Matteo Giuseppe Antonio Federico Marco Davide Simone Luca Giovanni Pietro Filippo Samuele Michele Christian Nicolò Emanuele Diego Daniele Stefano Alessio Cristian Manuel Gianluca Fabio Paolo Roberto Salvatore Vincenzo Domenico Raffaele Ciro Gennaro Giacomo Jacopo Elia Enea Achille Ludovico Niccolò Valerio Mirko Dario Sergio Nicola Giorgio Alberto Massimo Claudio Denis Giulio Cesare Ettore Leandro Brando Thomas Kevin Sebastiano Gioele Cristiano Flavio Ivan Fabrizio`,
    last: `Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Martinelli Vitale Lombardo Serra Coppola De_Santis D'Angelo Marchetti Parisi Villa Conte Ferraro Ferri Fabbri Bianco Marini Grasso Valentini Messina Sala De_Angelis Gatti Pellegrini Palumbo Sanna Farina Rizzi Monti Cattaneo Morelli Amato Silvestri Mazza Testa Grassi Pellegrino Carbone Giuliani Benedetti Barone Rossetti Caputo Montanari Guerra Palmieri Bernardi Martino Fiore De_Rosa Ferretti Bellini Basile Riva Donati Piras Vitali Battaglia Sartori Neri Costantini Milani Pagano Ruggiero Sorrentino D'Amico Orlando Negri Bassi Bonetti Cocco Pace Fumagalli Brambilla Zanetti Toscano Ranieri Bonfanti Pirola Esposito Cerri Zappa Tessitore`,
  },
  fr: {
    first: `Gabriel Léo Raphaël Louis Arthur Jules Adam Maël Lucas Hugo Noah Liam Gabin Sacha Paul Nathan Aaron Ethan Tom Éden Victor Martin Léon Mathis Nolan Timéo Théo Axel Enzo Antoine Valentin Maxime Clément Baptiste Alexis Romain Mathéo Yanis Rayan Kenzo Tiago Evan Malo Marius Robin Oscar Aurélien Florian Kévin Benjamin Corentin Quentin Thibault Bastien Loïc Dylan Jordan Killian Lenny Nils Esteban Mathys Owen Ewan Elias Ruben Lilian Anthony Jérémy Pierre Thomas Simon Jean Félix Gaspard Samuel Warren Andy Mattéo Rémi Tristan Enzo Lucien Hippolyte`,
    last: `Martin Bernard Thomas Petit Robert Richard Durand Dubois Moreau Laurent Simon Michel Lefebvre Leroy Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Muller Lefèvre Faure André Mercier Blanc Guérin Boyer Garnier Chevalier François Legrand Gauthier Perrin Robin Clément Morin Nicolas Henry Roussel Mathieu Masson Marchand Duval Denis Dumont Lemaire Noël Meyer Dufour Meunier Brun Blanchard Giraud Joly Rivière Brunet Gaillard Barbier Arnaud Gérard Roche Renard Schmitt Roy Leroux Colin Vidal Caron Picard Roger Fabre Aubert Lemoine Renaud Dumas Lacroix Olivier Bourgeois Benoît Rey Leclerc Payet Rolland Leclercq Guillaume Lecomte Dupuy Guillot Hubert Berger Carpentier Dupuis Moulin Deschamps Huet Vasseur Boucher Fleury Royer Klein Jacquet Poirier Marty Aubry Guyot Carré Renault Charpentier Ménard Maillard Baron Bertin Bailly Hervé Le_Gall Collet Léger Bouvier Prévost Millet Perrot Le_Roux Cousin Germain Breton Besson Langlois Rémy Le_Goff Pelletier Perrier Leblanc Lebrun Marchal Mallet Hamon Boulanger Monnier Michaud Guichard Gillet Étienne Poulain Tessier Chauvin Bouchet Lemaître Maréchal Humbert Reynaud Perret Cordier Pichon Lejeune Gilbert Lamy Delaunay Pasquier Laporte Grondin Hoarau`,
  },
  frAf: {
 first:`Moussa Mamadou Ibrahima Cheikh Abdoulaye Ousmane Amadou Boubacar Lamine Pape Babacar Modou Serigne Idrissa Souleymane Seydou Bakary Adama Sekou Moustapha Aliou Assane Mbaye Ismaïla Youssouf Oumar Sambou Ibou Djibril Mohamed Yacouba Karim Salif Drissa Dramane Hamidou Issa Ali Alassane Lassina Brahima Siaka Wilfried Serge Franck Didier Yann Arnaud Christian Junior Hervé Jérémie Stéphane Patrick Kévin Jordan Trésor Glody Merveille Chancel Bienvenu Fiston Cédric Arthur Steve Fabrice Landry Ulrich Wilson Habib Nampalys Malick Krépin Jean-Philippe Jean-Eudes Elye Mohamed-Ali El_Hadji Fodé Naby Aguibou Sidiki`,
 last:`Diallo Diop Ndiaye Sow Ba Fall Sy Gueye Seck Faye Mbaye Sarr Niang Cissé Camara Touré Traoré Coulibaly Keïta Konaté Diarra Sangaré Doumbia Dembélé Sissoko Sidibé Kanté Kouyaté Diakité Fofana Bamba Koné Kouassi Kouamé Yao N'Guessan Konan Zadi Zahui Dagba Koffi Aka Ehui Tiéné Mbarga Aboubakar Mbemba Kayembe Ilunga Kabongo Mputu Tshimanga Lusamba Ngoma Malonga Mabiala Makiadi Nzaba Bouanga Ndong Oyono Bayala Kaboré Ouédraogo Sawadogo Zongo Compaoré Tapsoba Sanou Yaméogo Sanogo Bagayoko Samassékou Haïdara Dieng Thiam Mendy Gomis Sané Badji Coly Diatta Goudiaby Sagna Diédhiou Bodian Ndour Kébé Wagué Mbodji Ngono Essomba Etoundi Ondo Mvondo Fouda Abena Mbida Nguema Obiang Akpa Dossou Adénon Hounkpè Agbossoumondé Ayité Laba`,
  },
  maghreb: {
 first:`Mohamed Youssef Amine Ayoub Hamza Ilyas Anas Achraf Hakim Sofiane Riyad Islam Yacine Bilal Nabil Karim Mehdi Adel Walid Rachid Nassim Rayan Adam Ismaël Zakaria Reda Abdelkader Abderrahmane Oussama Soufiane Mounir Yassine Saïd Tarek Aymen Seifeddine Montassar Ghaylen Elyes Khalil Wahbi Aïssa Farès Houssem Ramy Ilias Nordin Selim Imran Younes Badr Ismail Mohamed_Amine Abdessamad Azzedine Naoufel Mehdi Ziyad Othmane`,
 last:`Benali Bensaïd El_Amrani Belhadj Bouzid Haddad Mansouri Brahimi Benmoussa Bouzidi Benjelloun El_Fassi Tazi Alaoui Bennani Chraïbi Lahlou Berrada Belkacem Boudiaf Messaoudi Rahmani Hamdani Saidi Kaddouri Ouali Taleb Amrani Zerrouki Benyahia Bouaziz Trabelsi Jaziri Ben_Youssef Chaalali Talbi Ben_Romdhane Jebali Abdi Ben_Slimane El_Haddadi Ait_Ali Ouaziz Bouhaddouz Laghmouchi Lamrani Berkani Kharbouch Belkhayat Moutawakil Benzerga Hadjam Zorgane Chergui Kadri Gharbi Daoudi`,
  },
  egypt: {
 first:`Mohamed Ahmed Mahmoud Mostafa Omar Ali Youssef Karim Hossam Amr Tarek Ibrahim Hamdi Ramadan Emam Akram Marwan Ziad Hazem Islam Saad Shady Nabil Abdallah Mohanad Hamza Osama Ayman Taher Karim Yasser`,
 last:`Hassan Hussein Ali Ibrahim Ahmed Mahmoud Mostafa Abdelrahman Fathy Hamdy Gaber Ashour Zaki Kamal Soliman Rabia Tawfik Fawzy Sobhi Eid Abdelmonem Shehata Ragab Mekawy Abdelmaksoud Elsayed Ghazal Attia Lasheen Hany Shoubir Galal`,
  },
  gulf: {
 first:`Mohammed Abdullah Fahad Salem Saleh Sultan Turki Nawaf Faisal Khalid Saud Abdulrahman Abdulaziz Hassan Ali Yasser Mansour Rakan Firas Hattan Ayman Omar Saad Bandar Majed Hamad Jassim Mubarak Rashid Zayed Hamdan Ahmed Waleed Naif Meshal Ziyad Riyadh Marwan Haitham Ibrahim Abdulelah Musab Hamed Talal Khalifa Abdulmajeed Ayed Muteb Hussain Nasser Thamer Yazeed Osama Mazen Mishari Saif Hamza Mohannad Muhannad Raed Ammar Bader Abdulhadi Nawaf Hazem Sami Fawaz Jaber Hussam Anas Moaz Rayan Eid Awad Ghazi Hatem Murad Mutlaq`,
 last:`Al-Dawsari Al-Shahrani Al-Faraj Al-Ghannam Al-Bulaihi Al-Owais Al-Tambakti Al-Malki Al-Amri Al-Qahtani Al-Harbi Al-Otaibi Al-Shammari Al-Zahrani Al-Ghamdi Al-Mutairi Al-Anazi Al-Juhani Al-Shehri Al-Subaie Al-Rashidi Al-Hamdan Al-Najei Al-Buraikan Al-Obaid Al-Khaibari Al-Aqidi Al-Hassan Al-Kaabi Al-Mansoori Al-Hammadi Al-Naqbi Al-Shamsi Al-Marri Al-Hajri Al-Rawi Al-Khalifa Al-Azemi Al-Yami Al-Sahafi Al-Muwallad Al-Abed Asiri`,
  },
  levant: {
    first: `Ahmad Mohammad Omar Ali Hussein Hassan Yazan Mousa Mahmoud Bashar Amer Aiham Zaid Mohannad Rami Ibrahim Odai Ihsan Hamza Ammar Mustafa Ayman Ahmed Amjad Youssef Sami Ziad Karim Nour Elias Hadi`,
    last: `Al-Tamari Al-Naimat Al-Rawashdeh Haddad Khalil Nasser Saleh Odeh Abu_Zema Al-Mardi Al-Somah Kharbin Al-Khatib Hamdan Shalabi Darwish Jaber Mansour Awad Saadeh Khoury Hussein Kadhim Abbas Jassim Hassan Natiq Resan Bayesh Amin Al-Masri Qasem Shbeir Abu_Leila Matar`,
  },
  tr: {
    first: `Yusuf Eymen Ömer Mustafa Mehmet Ahmet Emir Kerem Miraç Hamza Ali Alparslan Aras Çınar Göktuğ Arda Kaan Berat Burak Can Cenk Deniz Efe Emre Enes Eren Furkan Hakan Halil İbrahim İsmail Kemal Mert Murat Oğuz Onur Orkun Ozan Salih Selim Serdar Sinan Tolga Tuna Umut Utku Yağız Yiğit Zeki Barış Batuhan Berkay Doğukan Ferdi Kenan Abdülkadir Semih Cengiz Baran Taylan Ahmetcan Bertuğ Metehan Muhammed Eyüp Uğur Kerem_Can Halil_İbrahim`,
    last: `Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Özcan Erdoğan Güneş Aksoy Karaca Akın Bulut Keskin Ünal Tekin Güler Kaplan Turan Acar Başaran Coşkun Taş Bozkurt Güven Ateş Sarı Uysal Kocabaş Akgün Akbaş Altun Ayhan Bayram Toprak Kahraman Duman Karakaya Tunç Yavuz Kalkan Sezer Erol Uçar Eren Dinç Çakır Durmaz Sevim Kocaman Aktürk Yazıcı Bayındır Akyol Ekinci Özer Avcı Sönmez Çiftçi`,
  },
  de: {
    first: `Noah Ben Matteo Finn Leon Elias Paul Henry Luis Felix Lukas Jonas Emil Luca Theo Anton Jakob Maximilian Moritz Julian Niklas Tim Jan Nico Leonard Fynn Mats Lennard Ole Tom Linus Philipp Florian Fabian Tobias Simon David Kilian Jannik Malik Luka Mika Joel Erik Johannes Jonathan Sebastian Benedikt Vincent Valentin Lars Marvin Dennis Kevin Pascal Marcel Dominik Patrick Daniel Christoph Lennart Hannes Till Bastian Konstantin Aaron Samuel Yannick Robin Kai Lucas Silas Levi Mattis Marlon Ilias Jamie Arne Merlin Tjark Jonte Joshua Niko Jayden`,
    last: `Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Schmitz Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Schubert Vogel Friedrich Keller Günther Frank Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht Schuster Simon Ludwig Böhm Winter Kraus Schumacher Krämer Vogt Stein Jäger Otto Sommer Groß Seidel Heinrich Brandt Haas Schreiber Graf Schulte Dietrich Ziegler Kuhn Kühn Pohl Engel Horn Busch Bergmann Voigt Sauer Arnold Wolff Pfeiffer Gruber Steiner Moser Wimmer Brunner Lechner Egger Hofer Leitner Pichler Eder Reiter Gasser Frei Baumgartner Gerber Widmer Bachmann Koller Kälin Sutter Wyss Brandl Kramer Heller Lindner Busch`,
  },
  nl: {
    first: `Noah Sem Liam Lucas Daan Finn Levi Luuk Mees James Milan Jesse Bram Sam Thijs Lars Jens Ruben Thomas Tim Max Stijn Teun Tijn Jayden Dex Siem Guus Joep Jurre Mats Niels Rick Bas Koen Wout Sven Jelle Timo Kenneth Quincy Xavi Ryan Calvin Tygo Thom Wessel Bart Jasper Gijs Pepijn Floris Hidde Dirk Kees Jan Pieter Joris Maarten Mathijs Arne Seppe Lander Jef Warre Tibo Kobe Senne Lowie Mauro Rune Wannes Brent Jarne Robbe Matteo Cas Vic Ilias Owen Jordy Micky`,
    last: `de_Jong Jansen de_Vries van_den_Berg van_Dijk Bakker Janssen Visser Smit Meijer de_Boer Mulder de_Groot Bos Vos Peters Hendriks van_Leeuwen Dekker Brouwer de_Wit Dijkstra Smits de_Graaf van_der_Meer van_der_Linden Kok Jacobs de_Haan Vermeulen van_den_Heuvel van_der_Veen van_den_Broek de_Bruijn de_Bruin van_der_Heijden Schouten van_Beek Willems van_Vliet van_de_Ven Hoekstra Maas Verhoeven Koster van_Dam van_der_Wal Prins Blom Huisman Peeters Maes Claes Goossens Wouters De_Smet Lambert Mertens Hermans Michiels Van_Damme Desmet Coppens Van_Hecke Verstraete Pauwels Dewulf De_Clercq Vandenbroucke Lemmens Martens Wuyts Verbeke Aerts Deprez Van_Acker Verhaegen Timmermans Kuipers Postma Veenstra`,
  },
  dk: {
    first: `William Noah Oscar Lucas Carl Victor Malthe Emil Alfred Elias Aksel Valdemar Magnus August Frederik Oliver Anton Johan Arthur Mikkel Mads Rasmus Jonas Andreas Mathias Kasper Christian Nicolai Simon Jesper Martin Thomas Gustav Tobias Sebastian Jakob Philip Albert Villads Lauritz Bertram Asger Jeppe Kristoffer Morten Nikolaj Rune Søren Lasse Conrad Silas Viggo Marius`,
    last: `Jensen Nielsen Hansen Pedersen Andersen Christensen Larsen Sørensen Rasmussen Jørgensen Petersen Madsen Kristensen Olsen Thomsen Christiansen Poulsen Johansen Møller Mortensen Knudsen Jakobsen Mikkelsen Olesen Frederiksen Laursen Henriksen Lund Schmidt Eriksen Holm Kristiansen Clausen Simonsen Svendsen Andreasen Iversen Jeppesen Mogensen Jacobsen Vestergaard Nissen Lauridsen Kjær Skov Bach Dahl Damsgaard Bech Ravn Gregersen Toft Bertelsen Juhl Lindstrøm Thygesen Kjærgaard Nørgaard Bundgaard`,
  },
  no: {
    first: `Jakob Emil Noah Oliver Filip William Lucas Liam Henrik Aksel Oskar Isak Magnus Elias Johannes Mathias Sander Tobias Kristian Martin Eirik Sindre Vegard Håkon Even Mats Sivert Ola Ole Odin Kasper Jonas Andreas Fredrik Markus Torbjørn Sebastian Alexander Thomas Aleksander Jørgen Stian Morten Kjetil Tor Vetle Brage Tord Herman Sigurd Edvard Leander Mikkel Teodor`,
    last: `Hansen Johansen Olsen Larsen Andersen Pedersen Nilsen Kristiansen Jensen Karlsen Johnsen Pettersen Eriksen Berg Haugen Hagen Johannessen Andreassen Jacobsen Dahl Jørgensen Halvorsen Henriksen Lund Sørensen Jakobsen Moen Gundersen Iversen Strand Solberg Svendsen Eide Knutsen Martinsen Paulsen Bakken Kristoffersen Mathisen Lie Amundsen Rasmussen Lunde Solheim Berge Moe Nygård Bakke Fredriksen Holm Lien Hauge Aasen Myklebust Berntsen Strandberg Thorsen Tangen Sandvik Bjørnstad`,
  },
  se: {
    first: `Lucas Liam William Elias Noah Hugo Oliver Oscar Adam Matteo Walter Alexander Leo Nils Alfred Ludvig Adrian Theo Leon Elliot Arvid Isak Viktor Vincent Gustav Axel Filip Albin Anton Emil Jonathan Melvin Love Olle Sixten Malte Viggo Edvin Gabriel Erik Johan Karl Anders Fredrik Jesper Mattias Simon Joakim Kristoffer Rasmus Linus Samuel Hampus Robin Marcus Pontus Teodor Charlie`,
    last: `Andersson Johansson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Pettersson Jonsson Jansson Hansson Bengtsson Jönsson Lindberg Jakobsson Magnusson Olofsson Lindström Lindqvist Lindgren Berg Axelsson Bergström Lundberg Lind Lundgren Lundqvist Mattsson Berglund Fredriksson Sandberg Henriksson Forsberg Sjöberg Wallin Engström Eklund Danielsson Lundin Håkansson Björk Bergman Gunnarsson Holm Wikström Samuelsson Isaksson Fransson Bergqvist Nyström Holmberg Arvidsson Löfgren Söderberg Nyberg Blomqvist Claesson Nordström Mårtensson Lundström Ekdal Hedlund`,
  },
  fi: {
    first: `Eino Väinö Leo Elias Oliver Onni Toivo Eeli Niilo Lenni Aatos Leevi Veeti Lauri Joel Aleksi Juho Mikko Janne Jukka Teemu Ville Antti Joona Topi Sami Tuomas Jesse Robin Pyry Urho Daniel Joni Otto Severi Rasmus Kalle Eemeli`,
    last: `Korhonen Virtanen Mäkinen Nieminen Mäkelä Hämäläinen Laine Heikkinen Koskinen Järvinen Lehtonen Lehtinen Saarinen Salminen Heinonen Niemi Heikkilä Kinnunen Salonen Turunen Salo Laitinen Tuominen Rantanen Karjalainen Jokinen Mattila Savolainen Lahtinen Ahonen Hakala Raitala Väisänen Toivio Tenho Kairinen Ojala Leinonen Hyvönen Peltonen`,
  },
  is: {
    first: `Aron Alexander Jón Sigurður Guðmundur Gunnar Ólafur Einar Kristján Stefán Magnús Jóhann Birkir Hörður Arnór Viðar Rúnar Albert Ísak Hákon Andri Sverrir Mikael Willum Kolbeinn Orri Daníel Atli Brynjar`,
    last: `Jónsson Sigurðsson Guðmundsson Gunnarsson Ólafsson Einarsson Kristjánsson Stefánsson Magnússon Jóhannsson Björnsson Árnason Halldórsson Þórsson Ingason Haraldsson Pálsson Sveinsson Helgason Karlsson Friðriksson Hermannsson Bjarnason Hallgrímsson Finnbogason Traustason Sigurjónsson Valdimarsson`,
  },
  pl: {
    first: `Antoni Jan Aleksander Franciszek Nikodem Szymon Filip Stanisław Leon Mikołaj Wojciech Kacper Ignacy Jakub Adam Michał Piotr Mateusz Bartosz Dawid Kamil Łukasz Marcin Tomasz Paweł Krzysztof Grzegorz Sebastian Patryk Damian Oskar Wiktor Hubert Igor Maksymilian Tymon Karol Przemysław Rafał Arkadiusz Konrad Dominik Maciej Bartłomiej Jarosław Robert Kuba Fabian Tymoteusz`,
    last: `Nowak Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak Dąbrowski Kozłowski Jankowski Mazur Kwiatkowski Krawczyk Piotrowski Grabowski Nowakowski Pawłowski Michalski Nowicki Adamczyk Dudek Zając Wieczorek Jabłoński Król Majewski Olszewski Jaworski Wróbel Malinowski Pawlak Witkowski Walczak Stępień Górski Rutkowski Michalak Sikora Ostrowski Baran Duda Szewczyk Tomaszewski Pietrzak Marciniak Wróblewski Zalewski Jakubowski Jasiński Zawadzki Sadowski Bąk Chmielewski Włodarczyk Borkowski Czarnecki Sawicki Sokołowski Urbański Kubiak Maciejewski Szczepański Kucharski Wilk Kalinowski Lis Mazurek Wysocki Adamski Kaźmierczak Wasilewski Sobczak Czerwiński Andrzejewski Cieślak Głowacki Zakrzewski Kołodziej Sikorski Krajewski Gajewski Szymczak Szulc Baranowski Laskowski Brzeziński Makowski Ziółkowski Przybylski`,
  },
  cz: {
 first:`Jakub Jan Tomáš Matyáš Adam Filip Vojtěch Ondřej David Lukáš Martin Petr Michal Daniel Matěj Šimon Štěpán Dominik Marek Patrik Václav Antonín Josef Jiří Pavel Radek Ladislav Roman Milan Peter Juraj Marián Matúš Samuel Erik Richard Dávid Tobiáš Kristián Oliver Alex Denis Adrián Sebastián`,
 last:`Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Marek Pospíšil Pokorný Hájek Král Jelínek Růžička Beneš Fiala Sedláček Doležal Zeman Kolář Navrátil Čermák Vaněk Urban Blažek Kříž Kovář Bartoš Vlček Polák Musil Šimek Konečný Malý Holub Štěpánek Kadlec Dostál Soukup Šťastný Mareš Moravec Tichý Sýkora Bureš Hrubý Kopecký Krejčí Kratochvíl Hudec Kováč Baláž Molnár Kováčik Lukáč Kollár Hrušovský Šimko Oravec Blaško Hanko Mráz Bednár Duda`,
  },
  hu: {
    first: `Bence Máté Levente Dominik Olivér Noel Marcell Ádám Dániel Zalán Botond Áron Milán Péter Zsombor Balázs Gergő Krisztián Attila Zoltán Tamás László Dávid Roland Barnabás Bálint Márk Kristóf Benedek Hunor Martin Norbert Csaba Gábor Zsolt András Kevin Benett`,
    last: `Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász Lakatos Mészáros Oláh Simon Rácz Fekete Szilágyi Török Fehér Balázs Gál Kis Szűcs Kocsis Pintér Fodor Szalai Sipos Magyar Lukács Gulyás Biró Király Katona László Jakab Bogdán Sándor Boros Fazekas Kelemen Antal Orosz Somogyi Fülöp Veres Budai Vida Hegedűs Deák Pál Vincze Szőke Fábián Vass Lengyel`,
  },
  ro: {
 first:`Andrei Alexandru David Ștefan Luca Matei Mihai Gabriel Ionuț Darius Rareș Vlad Denis Răzvan Florin Bogdan Cristian Adrian Marius Cosmin Claudiu Sorin Robert Alin Dragoș Ciprian Valentin Nicolae Dan George Dennis Tudor Sebastian Eduard Antonio Raul Octavian Lucian Iulian Nicușor Radu`,
 last:`Popa Popescu Ionescu Pop Radu Dumitru Stan Stoica Gheorghe Matei Ciobanu Rusu Munteanu Constantin Mihai Ene Florea Toma Ilie Dinu Moldovan Diaconu Marin Lazăr Barbu Tudor Cristea Nistor Nedelcu Dobre Anghel Oprea Voicu Neagu Mocanu Petrescu Dima Coman Iordache Sandu Badea Manea Ursu Lungu Chiriac Mircea Vasile Croitoru Avram Neacșu Moraru Cojocaru Tănase Bratu Olaru Grigore Mihăilă Stanciu Rus Marcu`,
  },
  yu: {
    first: `Luka Marko Nikola Stefan Filip Lazar Aleksa Vuk Mihajlo Uroš Nemanja Dušan Miloš Ognjen Petar Strahinja Andrej Veljko Bogdan Đorđe Ivan Josip Ante Mate Mario Dario Ivica Matej Lovro Toma Leon Jakov Duje Tin Karlo Fran Borna Roko Bruno Domagoj Mislav Antonio Igor Dejan Zoran Goran Darko Miroslav Vladimir Aleksandar Milan Mladen Sergej Kenan Edin Emir Amar Haris Armin Adnan Elvir Ermin Tarik Benjamin Anel Dino Damir Adem Mirza Eldin Sead Vanja Savo Pavle`,
    last: `Jovanović Petrović Nikolić Marković Đorđević Stojanović Ilić Stanković Pavlović Milošević Popović Simić Lukić Kostić Mitrović Živković Đurić Savić Todorović Tadić Mladenović Milovanović Vasić Ristić Radovanović Jović Milenković Lazarević Babić Vuković Kovačević Horvat Novak Knežević Marić Jurić Perić Pavić Božić Šarić Matić Blažević Grgić Kovačić Begić Hodžić Hadžić Mehmedović Delić Husić Kadić Kovač Zukić Salihović Halilović Hasanović Alić Muratović Mujić Suljić Omerović Karić Džafić Bajrić Selimović Jokić Lekić Bulatović Vujović Radunović Šćekić Raičević Mamić Pašalić Erceg Sučić Baturina Pongračić Vida Livaja Majer Stanišić Kalinić Brekalo`,
  },
  si: {
    first: `Luka Jan Nik Žan Tim Jakob Mark Gal Vid Tilen Aljaž Rok Matic Miha Žiga Anže Jaka Blaž Domen Klemen Lovro Nejc Urban Benjamin Timi Adam Sandi Jure`,
    last: `Novak Horvat Kovačič Krajnc Zupančič Potočnik Kos Golob Vidmar Kolar Mlakar Turk Božič Žagar Korošec Hribar Rozman Bizjak Šešlar Kurtić Stojanović Mlakar Vipotnik Elšnik Gnezda Zajc Brekalo Kotnik`,
  },
  sq: {
    first: `Arbër Ardit Arlind Armando Besart Bekim Blerim Dardan Endrit Erion Ermal Florent Gentian Herdi Ilir Jetmir Kreshnik Kristjan Leart Lirim Liridon Marash Milot Nedim Rei Taulant Valon Vedat Yll Elseid Altin Klevis Mirlind Ernest Fiorin Rron Albion Medon Edon Albian Lumbardh Arijon Florian`,
    last: `Hoxha Shehu Krasniqi Gashi Berisha Morina Kelmendi Bytyqi Hasani Rexhepi Hyseni Ahmeti Halimi Ismaili Mustafa Shala Rashica Muriqi Zeneli Kastrati Selmani Bajrami Sadiku Haxhiu Dervishi Kola Mema Basha Cikalleshi Lika Manaj Uzuni Ramadani Mitaj Asllani Laçi Hysaj Ismajli Bardhi Abdullahu Paqarada Vojvoda`,
  },
  mk: {
    first: `Bojan Darko Aleksandar Stefan Goran Vlatko Boban Marjan Dimitar Ivan Kiril Martin Filip Nikola Tihomir Jovan Milan Gjorgji Igor Viktor Enis Ezgjan Eljif`,
    last: `Stojanovski Petrovski Nikolovski Trajkovski Ristovski Velkovski Ilievski Spirovski Stojkovski Atanasov Dimitrovski Georgievski Jovanovski Kostovski Angelovski Todorovski Serafimovski Musliu Ademi Alimi Elmas Bardhi`,
  },
  bg: {
    first: `Georgi Ivan Dimitar Nikolay Aleksandar Martin Stoyan Hristo Petar Kristian Todor Valentin Kiril Radoslav Spas Atanas Yordan Viktor Iliya Boris Plamen Andrian Simeon Zhivko`,
    last: `Ivanov Georgiev Dimitrov Petrov Nikolov Hristov Stoyanov Todorov Iliev Angelov Atanasov Vasilev Yordanov Kolev Marinov Popov Mihaylov Krastev Stefanov Pavlov Kostov Tsvetkov Despodov Chochev Bozhinov Kirilov Minchev Karagaren`,
  },
  gr: {
 first:`Georgios Ioannis Konstantinos Dimitrios Nikolaos Panagiotis Vasileios Christos Athanasios Michail Evangelos Spyridon Antonios Anastasios Theodoros Charalampos Stavros Eleftherios Ilias Apostolos Emmanouil Petros Alexandros Sotirios Andreas Stylianos Kyriakos Pantelis Fotios Marios Giannis Kostas Dimitris Nikos Tasos Vangelis Lazaros Savvas Thanos Lefteris Pavlos Fivos`,
 last:`Papadopoulos Georgiou Papadakis Pappas Oikonomou Dimitriou Konstantinidis Nikolaidis Vasileiou Ioannou Karagiannis Papageorgiou Christodoulou Makris Antoniou Athanasiou Theodorou Panagiotou Michailidis Papanikolaou Alexiou Kostopoulos Angelopoulos Dimopoulos Vlachos Stathopoulos Raptis Kalogeropoulos Lamprou Galanis Zografos Floros Samaras Kyriakopoulos`,
  },
  ru: {
    first: `Aleksandr Maksim Artyom Mikhail Ivan Dmitri Daniil Kirill Andrei Yegor Nikita Ilya Matvei Timofei Roman Vladimir Sergei Pavel Aleksei Denis Igor Anton Vadim Oleg Yuri Vitali Konstantin Georgi Fyodor Lev Arseniy Bogdan Taras Mykola Oleksandr Mykhailo Andriy Vladyslav Yaroslav Danylo Oleh Viktor Ruslan Serhiy Vitaliy Illia Artem Dmytro Maksym Valeriy`,
    last: `Ivanov Smirnov Kuznetsov Popov Vasilyev Petrov Sokolov Mikhailov Novikov Fyodorov Morozov Volkov Alekseyev Lebedev Semyonov Yegorov Pavlov Kozlov Stepanov Nikolayev Orlov Andreyev Makarov Nikitin Zakharov Zaitsev Solovyov Borisov Yakovlev Grigoryev Romanov Vorobyov Sergeyev Frolov Alexandrov Dmitriev Korolev Gusev Kiselev Ilyin Maksimov Polyakov Sorokin Vinogradov Belov Medvedev Antonov Tarasov Zhukov Baranov Filippov Komarov Davydov Gerasimov Bogdanov Osipov Titov Markov Mironov Krylov Karpov Vlasov Melnikov Denisov Kovalenko Shevchenko Bondarenko Tkachenko Kravchenko Boyko Kovalchuk Oliynyk Shevchuk Polishchuk Bondar Tkachuk Moroz Lysenko Rudenko Savchenko Petrenko Marchenko Melnyk Kravets Stepanenko Sydorchuk Konoplya Shaparenko Tymchyk`,
  },
  baltic: {
    first: `Lukas Matas Jokūbas Nojus Dominykas Kajus Benas Herkus Rokas Paulius Mantas Tomas Arnas Gytis Deividas Vilius Justas Karolis Edvinas Darius Tadas Roberts Artūrs Kristers Daniels Rihards Mārtiņš Jānis Raimonds Dāvis Kārlis Edgars Rasmus Robin Oliver Sebastian Karl Mattias Henri Joosep Mihkel Kristjan Markus`,
    last: `Kazlauskas Jankauskas Petrauskas Stankevičius Vasiliauskas Žukauskas Butkus Paulauskas Urbonas Kavaliauskas Navickas Ramanauskas Šimkus Rimkus Baranauskas Vaitkus Lukšys Girdvainis Utkus Bērziņš Kalniņš Ozoliņš Jansons Liepiņš Krūmiņš Balodis Ozols Zariņš Pētersons Vītols Kļaviņš Lācis Āboliņš Jaunzems Ikaunieks Tamm Saar Sepp Mägi Kask Kukk Rebane Ilves Pärn Koppel Kuusk Lepik Oja Vaher Kallas`,
  },
  caucasus: {
    first: `Giorgi Luka Nikoloz Davit Saba Levan Irakli Otar Zurab Lasha Guram Vakhtang Tornike Budu Zviad Beka Mikheil Anzor Shota Giga Sandro Nika Jaba Armen Aram Hayk Narek Gor Tigran Artur Edgar Vahan Sargis Arman Karen Gevorg Erik Levon Rahil Emin Ramil Elvin Mahir Toral Namik Nijat Rauf Tural Bahlul Renat Elnur Vugar Khayal`,
    last: `Beridze Kapanadze Gelashvili Maisuradze Giorgadze Lomidze Tsiklauri Nozadze Mamaladze Chakvetadze Kiteishvili Kvirkvelia Lochoshvili Kashia Davitashvili Zivzivadze Mekvabishvili Kvekveskiri Shengelia Gvelesiani Tabidze Kiladze Abuladze Gogia Dvali Kakabadze Hakobyan Harutyunyan Sargsyan Grigoryan Petrosyan Khachatryan Hovhannisyan Vardanyan Avetisyan Karapetyan Gevorgyan Mkrtchyan Ghazaryan Martirosyan Barseghyan Bichakhchyan Aliyev Mammadov Hasanov Huseynov Guliyev Abdullayev Ibrahimov Ismayilov Safarov Jafarov Babayev Mahmudov Rzayev Garayev`,
  },
  wAf: {
 first:`Chukwuemeka Chinedu Emeka Obinna Ikenna Chidi Uche Nnamdi Kelechi Tobenna Ifeanyi Chibuike Somto Ebuka Tochukwu Kingsley Victor Samuel Daniel David Joseph Michael Emmanuel Godwin Sunday Peter Paul Joshua Ademola Babajide Oluwaseun Ayodele Adewale Tunde Femi Segun Kayode Olamide Tobi Ayomide Oluwatobi Dele Gbenga Sola Wale Bayo Abubakar Ibrahim Musa Sani Umar Aliyu Yusuf Shehu Bashir Kabiru Nasiru Kwame Kofi Kwabena Kwaku Yaw Kwasi Kojo Kwadwo Nana Prince Godfred Ebenezer Isaac Richmond Felix Raphael Fisayo Calvin Nathan`,
 last:`Okafor Okonkwo Eze Nwosu Obi Okeke Chukwu Nnamani Onyeka Ugwu Nwankwo Adeyemi Adebayo Ogunleye Afolabi Balogun Olawale Bakare Ajayi Akinola Oladipo Oyedele Adesanya Babatunde Lawal Bello Abubakar Ibrahim Musa Mohammed Yusuf Sani Danjuma Garba Aminu Mensah Owusu Boateng Asante Osei Appiah Agyeman Ofori Amoah Darko Addo Frimpong Ansah Badu Yeboah Kyei Opoku Antwi Amankwah Acheampong Sarpong Adjei Nkrumah Donkor Koroma Kamara Sesay Conteh Bangura Turay Jalloh Barrie Kargbo Jallow Ceesay Sowe Touray Darboe Njie Bojang Kanteh Colley Sanneh Weah Kollie Gaye`,
  },
  carib: {
    first: `Leon Shamar Kemar Andre Damion Romario Kevaughn Javain Tyreek Kaheem Daniel Jamal Jermaine Tremaine Akeem Rasheed Omari Kadeem Tevin Devonte Kyle Ricardo Marlon Rondell Levi Dexter Garfield Kemoy Isaac Malik Nathaniel Trivante Dujuan Renaldo Jahmali Demarai Kasey Ethan Dante`,
    last: `Brown Campbell Williams Thompson Grant Morgan Reid Henry Clarke Lewis Gayle Bailey Francis Gordon Hylton Powell Spence Bryan Richards Lawrence Mattocks Bernard Bell Baptiste Charles Joseph Moore Pinnock Nicholson Bailey Antonio Leigh Lowe Elliott Barnes Gray Wright Phillip Garcia Cato Molino Jones Hosten`,
  },
  frCarib: {
 first:`Kévin Loïc Steeven Thierry Ruddy Mondy Bryan Wilfried Jean-Pierre Duckens Frantzdy Carlens Derrick Mickaël Jordan Ludovic Rodrigue Stéphane Marvin Yohann Dimitri Ronald Lenny Andy Yannick Christopher Dylan Mathis`,
 last:`Pierre Jean-Baptiste Joseph Louis Charles Bazile Etienne Desir Alcéus Beauvais Clermont Florestal Toussaint Romulus Jacques Mathurin Augustin Hilaire Sylvestre Marie-Rose Arnaud Lafortune Bellerose Cicéron Nazon Saint-Louis Placide Valcin Janvier Nivet Alphonse Lambourde Goma`,
  },
  luso: {
 first:`Manuel João António Gelson Domingos Mateus Djalma Edgar Ricardo Ary Hélder Kenny Garry Rolando Ryan Jamiro Steven Willy Dylan Jovane Lisandro Nuno Fábio Bruno Nelson Carlos Júlio Zito Fredy Bastos Jairo Ianique Telmo Zezinho`,
 last:`Fernandes Pereira Silva Gomes Lopes Mendes Tavares Monteiro Semedo Borges Rodrigues Cabral Sanches Furtado Varela Moreira Fortes Andrade Teixeira Baptista Dju Mané Djaló Embaló Baldé Sanhá Indjai Cassamá Nanqui Candé Mancanhá Camará Rosa Costa Delgado Moniz Sambu Cá Tchami Cassinda Mabiala Monteiro Dala Kiaku`,
 style: 'iberian',
  },
  eAf: {
    first: `Michael Victor Eric Brian Kevin Allan Dennis Erick Collins Joseph Patrick Emmanuel Moses Joshua Ibrahim Abdallah Simon Farouk Khalid Bakari Juma Hamisi Mohamed Shaban Feisal Duncan Clifton Austin Amos Elvis Timothy Ronald Derrick Kenneth Musa Rashid`,
    last: `Otieno Ochieng Odhiambo Omondi Onyango Kamau Mwangi Njoroge Kariuki Wafula Wekesa Kiprotich Cheruiyot Okello Mukasa Ssekyanzi Kizito Lubega Mwakalebela Haji Mussa Nyoni Juma Hamisi Shaban Kibet Kiplagat Wanjala Omolo Owino Nsubuga Kato Ssemakula Byaruhanga Tumusiime Lwanga Mutua Muriuki Kimani Waweru`,
  },
  rw: {
    first: `Jean_Claude Emmanuel Djihad Innocent Olivier Thierry Fitina Kevin Ange Hakim Eric Patrick Yves Samuel Gilbert Jean_Bosco Didier Ismaïl Abeddy Muhadjiri Fabrice Christian Aimable Gaël Bonheur`,
    last: `Habimana Niyonzima Mugisha Bizimana Hakizimana Nshuti Muhire Manzi Mukunzi Rutanga Kwizera Tuyisenge Iradukunda Ndayishimiye Nkurunziza Niyonkuru Uwimana Nsengiyumva Mutsinzi Byiringiro Imanishimwe Rwatubyaye Ndikumana Ntwari Nizeyimana Mugenzi`,
  },
  horn: {
    first: `Abel Dawit Yonas Getaneh Shimelis Surafel Amanuel Henok Biruk Kidus Natnael Robel Samuel Tekle Mesfin Abdirahman Abdullahi Liban Mustafa Yusuf Mohamed Ahmed Abdi Filmon Merhawi`,
    last: `Tadesse Bekele Haile Kebede Alemayehu Gebremedhin Tesfaye Desta Wolde Mulugeta Assefa Girma Shiferaw Getachew Abebe Warsame Farah Hassan Abdi Omar Jama Mohamed Yohannes Tekle Gebreyesus Ali`,
  },
  sAf: {
 first:`Thabo Sipho Themba Bongani Teboho Lebogang Mthokozisi Siyabonga Thulani Khanyisa Relebohile Percy Ronwen Evidence Aubrey Lyle Bradley Grant Keagan Ethan Tokelo Mihlali Sibusiso Luther Elias Kennedy Patson Clatous Fashion Enock Lameck Kelvin Brian Spencer Boniface Khama Knowledge Teenage Marvelous Tawanda Tinashe Takudzwa Tendai Farai Kaizer Oswin Iqraam Zakhele Neo Thapelo`,
 last:`Mokoena Nkosi Dlamini Ndlovu Khumalo Zulu Mthembu Ngcobo Mahlangu Mabaso Sithole Mkhize Cele Mbatha Shabalala Zwane Mofokeng Molefe Masilela Maluleke Baloyi Mashego Mokwena Modiba Mudau Tau Foster Williams Zungu Hlongwane Mayambela Daka Mwepu Musonda Chama Sakala Phiri Banda Mwila Kangwa Chisamba Lungu Kampamba Mulenga Sunzu Katongo Chona Mahachi Hadebe Munetsi Dube Moyo Ncube Sibanda Nyathi Mpofu Chirwa Mhango Msowoya Sibisi Mbule Mokwana`,
  },
  jp: {
    first: `Haruto Sota Yuto Riku Haruki Yuma Ren Minato Hinata Sora Kaito Yamato Asahi Takumi Daiki Kento Kota Shota Ryota Yuta Kenta Takuma Ritsu Tsubasa Shun Ryo Kaoru Daichi Hayato Kazuki Kosei Koki Naoki Rei Ryusei Sho Taiga Takeru Tomoya Yuki Yusuke Keita Hiroki Keisuke Ayase Kaishu Mao Reo Seiya Taichi Wataru Yuya Ao Hiroto Itsuki Kanata Rui Joel Koji Kanji`,
    last: `Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu Yamazaki Mori Abe Ikeda Hashimoto Yamashita Ishikawa Nakajima Maeda Fujita Ogawa Goto Okada Hasegawa Murakami Kondo Ishii Saito Sakamoto Endo Aoki Fujii Nishimura Fukuda Ota Miura Fujiwara Okamoto Matsuda Nakagawa Nakano Harada Ono Tamura Takeuchi Kaneko Wada Nakayama Ishida Ueda Morita Hara Shibata Sakai Kudo Yokoyama Miyazaki Miyamoto Uchida Takagi Ando Taniguchi Ohno Maruyama Imai Takada Fujimoto Takeda Murata Ueno Sugiyama Masuda Sugawara Hirano Otsuka Chiba Kubo Seko Itakura`,
  },
  kr: {
    first: `Min-jun Seo-jun Do-yoon Ye-jun Si-woo Ha-jun Ju-won Ji-ho Ji-hoo Jun-woo Jun-seo Gun-woo Hyun-woo Ji-hwan Seung-woo Woo-jin Seung-hyun Min-jae Min-seo Jae-won Jae-hyun Tae-yang Dong-hyun Sung-min Hyun-jun Ui-jo Hee-chan Seung-ho In-beom Jun-ho Yeong-woo Gyu-sung Jin-su Young-gwon Chang-hoon Dong-jun Ho-yeon Ki-hoon Jae-sung Tae-hwan Min-hyuk Jun-young Ji-sung Hyeon-gyu Seong-jin Dong-gyeong Jae-ik Min-kyu Sang-ho Yong-woo Hyun-seok Joo-ho Eun-sung Jin-woo Tae-hee Kyung-won Byung-joon Sung-hoon Yeon-woo Ha-min Jae-min Do-hyun Ji-an Seon-woo Woo-hyun Han-gyeol Chan-young Ye-chan Geon-hee Kang-min Si-hun Su-ho Dae-won Jun-hyuk Min-woo Hyun-soo Sung-jin Woo-seok Jung-hoon`,
    last: `Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song Jeon Hong Yoo Ko Moon Yang Son Bae Baek Heo Nam Noh Ha Jeong Um Paik`,
    style: 'family-first',
  },
  cn: {
    first: `Wei Hao Jun Lei Yang Jie Tao Peng Bin Xin Yu Hang Rui Kai Chen Zhen Long Ming Qiang Yi Hui Bo Feng Yan Zhi Cheng Jian Lin Xu Shuai Zihao Haoran Yuxuan Zimo Junjie Yifan Zeyu Haoyu Yichen Junhao Tianyu Mingxuan Shihao Zhenyu Hongbo`,
    last: `Wang Li Zhang Liu Chen Yang Huang Zhao Wu Zhou Xu Sun Ma Zhu Hu Guo He Gao Lin Luo Zheng Liang Xie Song Tang Han Feng Deng Cao Peng Zeng Xiao Tian Dong Yuan Pan Cai Jiang Yu Du Ye Cheng Wei Su Lü Ding Ren Shen Yao Lu Cui Zhong Tan Jin`,
    style: 'family-first',
  },
  vn: {
    first: `Quang_Hải Văn_Hậu Công_Phượng Tiến_Linh Văn_Toàn Duy_Mạnh Hoàng_Đức Tuấn_Anh Văn_Thanh Xuân_Trường Đình_Trọng Thành_Chung Văn_Lâm Văn_Khang Đình_Bắc Minh_Khoa Thái_Sơn Văn_Vĩ Minh_Quang Đức_Huy Bảo_Long Gia_Huy`,
    last: `Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đào Đoàn`,
    style: 'family-first',
  },
  sea: {
    first: `Muhammad Ahmad Rizky Bagas Egy Witan Asnawi Pratama Ramadhan Arhan Fajar Hansamu Rachmat Ernando Marselino Dimas Ricky Yakob Saddil Rafael Kritsada Thanawat Supachai Sarach Ekanit Weerathep Theerathon Thitiphan Kanokpon Suphanat Bordin Peerapat Phitiwat Mark John Patrick Daniel Paolo Javier Neil Amani Jesus Kevin`,
    last: `Pratama Saputra Nugroho Ramadhan Hidayat Setiawan Wibowo Kurniawan Santoso Putra Rahman Firmansyah Gunawan Susanto Wijaya Hutapea Simanjuntak Sitorus Sembiring Tarigan Ferdinan Maulana Syahputra Saengsri Wongsa Srisuk Chaiyaphum Buathong Phromrak Kaewsri Thongkham Kasemsuk Sukprasert Jaikla Mueanta Chuchuen Bunmathan Hemvipat Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Villanueva Aquino Castillo dela_Cruz Gonzales Marquez Tabinas`,
  },
  ir: {
 first:`Mehdi Ali Reza Amir Mohammad Hossein Saeid Milad Saman Alireza Morteza Ehsan Omid Vahid Karim Ramin Majid Hamed Arash Arian Shahab Payam Pouya Aria Kasra Mohammad_Reza Amirhossein Yasin Danial`,
 last:`Hosseini Mohammadi Rezaei Ahmadi Karimi Moradi Hashemi Jafari Rahimi Kazemi Ghasemi Mousavi Sadeghi Ebrahimi Azizi Nouri Taheri Rostami Ansari Bagheri Amiri Shojaei Gholizadeh Mohebi Torabi Jalali`,
  },
  south_asia: {
    first: `Arjun Rahul Rohan Aarav Vihaan Aditya Sahil Ishaan Ayush Karan Nikhil Siddharth Anirudh Akash Vikram Sandesh Gurpreet Jeakson Sahal Anwar Ashique Udanta Brandon Liston Manvir Bipin Mehtab Pritam Subhasish Rahim Nandhakumar Vibin Imran Hamza Bilal Zain Usman`,
    last: `Singh Kumar Sharma Patel Das Nair Reddy Rao Gupta Thapa Bose Mondal Sarkar Ali Khan Chhetri Gogoi Bheke Fernandes Colaco Rodrigues D'Silva Kuruniyan Kotal Jhingan Gurung Ralte Hnamte Chhangte Pandita Tangri Meitei Laishram Thangjam Ahmed Hussain Qureshi Malik Chaudhry`,
  },
  us: {
 first:`Liam Noah Oliver James Elijah William Henry Lucas Benjamin Theodore Mateo Levi Sebastian Jack Ezra Michael Daniel Leo Owen Samuel Hudson Alexander Asher Luca Ethan John David Jackson Joseph Mason Luke Matthew Julian Dylan Elias Jacob Gabriel Logan Aiden Thomas Isaac Miles Grayson Santiago Anthony Wyatt Carter Jayden Caleb Cooper Josiah Charles Christopher Isaiah Nolan Cameron Nathan Joshua Kai Angel Lincoln Andrew Roman Adrian Aaron Wesley Ian Axel Brooks Bennett Weston Rowan Christian Theo Eli Silas Jonathan Ryan Walker Jaxon Micah Everett Robert Parker Jeremiah Jordan Gael Austin Adam August Xavier Myles Dominic Damian Nicholas Carson Hunter Emmett Harrison Vincent Milo Jasper Jonah Zion Connor Declan Tyler Brandon Tanner DeAndre Darius Malachi Jalen Tyrese Brenden Gianluca Diego Cade Reggie Tanner`,
 last:`Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton Graham Reynolds Griffin Wallace West Cole Hayes Bryant Herrera Gibson Ellis Medina Aguilar Stevens Murray Ford Castro Marshall Owens McDonald Woods Washington Kennedy Wells Vargas Henry Freeman Webb Tucker Burns Crawford Olson Porter Hunter Gordon Mendez Shaw Snyder Mason Dixon Holmes Palmer Wagner Black Robertson Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Garza Daniels Ferguson Nichols Weaver Gardner Payne Grant Dunn Spencer Hawkins Arnold Pierce Hansen Peters Santos Hart Bradley Knight Elliott Cunningham Duncan Armstrong Hudson Lane Riley Andrews Ray Berry Hoffman Johnston Matthews Richards Willis Carpenter Lawrence`,
  },
  au: {
 first:`Jack Oliver Noah William Thomas Lachlan Cooper Riley Jacob Ethan James Harrison Hunter Xavier Mitchell Bailey Jake Connor Liam Charlie Ryan Nathan Kai Jordan Tyler Brodie Callum Jayden Angus Hamish Fletcher Archer Flynn Beau Zac Josh Max Darcy Lucas Leo Hugo Mason Isaac Nestory Kye Jordy Cameron Aiden Patrick Lewis`,
 last:`Smith Jones Williams Brown Wilson Taylor Johnson White Martin Anderson Thompson Thomas Walker Harris Lee Ryan Robinson Kelly King Davis Wright Evans Roberts Green Hall Wood Jackson Clarke Lewis James Phillips Mitchell Turner Cooper Hughes Parker Murphy Edwards Young Campbell Stewart Morris Hill Bell Ward Watson Morgan Baker Scott Miller Price Collins Kennedy Duke Devlin Metcalfe O'Neill Burgess Goodwin Bos Wright Popovic`,
  },
  il: {
    first: `Noam Ariel Itay Omer Yonatan Eitan Daniel Amit Yarin Dor Liel Tal Shon Oscar Manor Ilay Mohammad Anan Dia Gadi Eden Yuval`,
    last: `Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Azoulay Malka Katz Abergel Shalom Gabay Ohana Yosef Golan Weissman Abu_Fani Zahavi Solomon Dasa`,
  },
}

/** Which cultures a nation's young players come from, and in what proportion. */
export const NATION_CULTURES: Record<string, [string, number][]> = {
  England: [['en', 74], ['wAf', 10], ['carib', 7], ['gael', 4], ['frAf', 2], ['south_asia', 3]],
  Scotland: [['gael', 82], ['en', 12], ['wAf', 4], ['carib', 2]],
  Wales: [['cymru', 70], ['en', 24], ['wAf', 3], ['carib', 3]],
  'Northern Ireland': [['gael', 88], ['en', 12]],
  'Republic of Ireland': [['gael', 88], ['en', 4], ['wAf', 6], ['carib', 2]],
  France: [['fr', 58], ['frAf', 22], ['maghreb', 14], ['frCarib', 4], ['pt', 2]],
  Spain: [['es', 86], ['latam', 6], ['maghreb', 3], ['frAf', 3], ['wAf', 2]],
  Portugal: [['pt', 82], ['luso', 14], ['br', 4]],
  Brazil: [['br', 100]],
  Italy: [['it', 88], ['frAf', 4], ['latam', 3], ['maghreb', 3], ['wAf', 2]],
  Germany: [['de', 74], ['tr', 10], ['yu', 5], ['pl', 3], ['wAf', 3], ['frAf', 2], ['levant', 1], ['maghreb', 2]],
  Austria: [['de', 74], ['yu', 12], ['tr', 7], ['wAf', 4], ['sq', 3]],
  Switzerland: [['de', 54], ['fr', 14], ['it', 8], ['yu', 8], ['sq', 8], ['frAf', 8]],
  Netherlands: [['nl', 72], ['carib', 9], ['maghreb', 10], ['wAf', 4], ['tr', 3], ['frAf', 2]],
  Belgium: [['nl', 46], ['fr', 26], ['frAf', 15], ['maghreb', 11], ['it', 2]],
  Luxembourg: [['fr', 40], ['de', 30], ['pt', 20], ['luso', 10]],
  Denmark: [['dk', 84], ['yu', 5], ['wAf', 5], ['levant', 3], ['tr', 3]],
  Norway: [['no', 84], ['horn', 6], ['wAf', 4], ['yu', 3], ['levant', 3]],
  Sweden: [['se', 70], ['yu', 9], ['horn', 6], ['levant', 6], ['wAf', 5], ['fi', 2], ['sq', 2]],
  Finland: [['fi', 88], ['se', 4], ['horn', 4], ['wAf', 4]],
  Iceland: [['is', 100]],
  'Faroe Islands': [['dk', 60], ['is', 40]],
  Poland: [['pl', 100]],
  Czechia: [['cz', 100]], 'Czech Republic': [['cz', 100]], Slovakia: [['cz', 85], ['hu', 15]],
  Hungary: [['hu', 100]],
  Romania: [['ro', 94], ['hu', 6]], Moldova: [['ro', 80], ['ru', 20]],
  Serbia: [['yu', 100]], Croatia: [['yu', 100]], 'Bosnia and Herzegovina': [['yu', 100]], Montenegro: [['yu', 100]],
  Slovenia: [['si', 88], ['yu', 12]],
  'North Macedonia': [['mk', 70], ['sq', 30]],
  Albania: [['sq', 100]], Kosovo: [['sq', 100]],
  Bulgaria: [['bg', 100]],
  Greece: [['gr', 94], ['sq', 6]], Cyprus: [['gr', 100]],
  Türkiye: [['tr', 100]],
  Russia: [['ru', 100]], Ukraine: [['ru', 100]], Belarus: [['ru', 100]], Kazakhstan: [['ru', 50], ['caucasus', 50]],
  Lithuania: [['baltic', 100]], Latvia: [['baltic', 100]], Estonia: [['baltic', 100]],
  Georgia: [['caucasus', 100]], Armenia: [['caucasus', 100]], Azerbaijan: [['caucasus', 100]],
  Malta: [['it', 50], ['en', 50]], Gibraltar: [['en', 60], ['es', 40]], Andorra: [['es', 60], ['fr', 40]], Liechtenstein: [['de', 100]],
  Israel: [['il', 100]],
  Morocco: [['maghreb', 100]], Algeria: [['maghreb', 100]], Tunisia: [['maghreb', 100]], Libya: [['maghreb', 100]],
  Egypt: [['egypt', 100]],
  'Saudi Arabia': [['gulf', 100]], 'United Arab Emirates': [['gulf', 100]], Qatar: [['gulf', 100]], Oman: [['gulf', 100]], Yemen: [['gulf', 100]],
  Iraq: [['levant', 100]], Jordan: [['levant', 100]], Syria: [['levant', 100]], Lebanon: [['levant', 100]], Palestine: [['levant', 100]],
  Iran: [['ir', 100]], Afghanistan: [['ir', 60], ['south_asia', 40]],
  Nigeria: [['wAf', 100]], Ghana: [['wAf', 100]], 'Sierra Leone': [['wAf', 100]], Liberia: [['wAf', 100]], Gambia: [['wAf', 100]],
  Senegal: [['frAf', 100]], Mali: [['frAf', 100]], "Côte d'Ivoire": [['frAf', 100]], Cameroon: [['frAf', 100]], Guinea: [['frAf', 100]],
  'Burkina Faso': [['frAf', 100]], 'Congo DR': [['frAf', 100]], Congo: [['frAf', 100]], Gabon: [['frAf', 100]], Benin: [['frAf', 100]],
  Togo: [['frAf', 100]], 'Central African Republic': [['frAf', 100]], Comoros: [['frAf', 60], ['maghreb', 40]], Mauritania: [['frAf', 60], ['maghreb', 40]],
  Niger: [['frAf', 100]], Chad: [['frAf', 100]], Madagascar: [['frAf', 70], ['fr', 30]],
  'Equatorial Guinea': [['frAf', 50], ['es', 20], ['luso', 30]],
  'Cabo Verde': [['luso', 100]], 'Guinea-Bissau': [['luso', 100]], Angola: [['luso', 100]], Mozambique: [['luso', 100]], 'São Tomé and Príncipe': [['luso', 100]],
  Kenya: [['eAf', 100]], Uganda: [['eAf', 100]], Tanzania: [['eAf', 100]], Rwanda: [['rw', 100]], Burundi: [['rw', 100]], Ethiopia: [['horn', 100]], Eritrea: [['horn', 100]], Somalia: [['horn', 100]], 'South Sudan': [['eAf', 100]],
  'South Africa': [['sAf', 100]], Zambia: [['sAf', 100]], Zimbabwe: [['sAf', 100]], Namibia: [['sAf', 100]], Malawi: [['sAf', 100]], Mauritius: [['frAf', 50], ['south_asia', 50]],
  Argentina: [['latam', 100]], Uruguay: [['latam', 100]], Chile: [['latam', 100]], Paraguay: [['latam', 100]], Bolivia: [['latam', 100]], Peru: [['latam', 100]],
  Colombia: [['latam', 100]], Ecuador: [['latam', 100]], Venezuela: [['latam', 100]], Mexico: [['latam', 100]], 'Costa Rica': [['latam', 100]],
  Honduras: [['latam', 100]], Panama: [['latam', 100]], Guatemala: [['latam', 100]], 'El Salvador': [['latam', 100]], Cuba: [['latam', 100]],
  'Dominican Republic': [['latam', 100]], 'Puerto Rico': [['latam', 70], ['us', 30]],
  'United States': [['us', 70], ['latam', 22], ['wAf', 4], ['carib', 4]],
  Canada: [['us', 62], ['fr', 14], ['carib', 10], ['wAf', 8], ['frAf', 6]],
  Jamaica: [['carib', 100]], 'Trinidad and Tobago': [['carib', 100]], Barbados: [['carib', 100]], Grenada: [['carib', 100]], 'Saint Kitts and Nevis': [['carib', 100]],
  'Saint Lucia': [['carib', 100]], 'Saint Vincent and the Grenadines': [['carib', 100]], 'Antigua and Barbuda': [['carib', 100]], Bermuda: [['carib', 100]], Montserrat: [['carib', 100]],
  Guyana: [['carib', 80], ['south_asia', 20]], Suriname: [['carib', 70], ['nl', 20], ['south_asia', 10]], Curacao: [['carib', 60], ['nl', 40]],
  Haiti: [['frCarib', 100]], Guadeloupe: [['frCarib', 100]], Martinique: [['frCarib', 100]], 'French Guiana': [['frCarib', 100]],
  Japan: [['jp', 100]], 'Korea Republic': [['kr', 100]], 'Korea DPR': [['kr', 100]], 'China PR': [['cn', 100]], 'Chinese Taipei': [['cn', 100]], 'Hong Kong': [['cn', 90], ['en', 10]],
  Vietnam: [['vn', 100]], Thailand: [['sea', 100]], Indonesia: [['sea', 100]], Philippines: [['sea', 100]],
  India: [['south_asia', 100]], Pakistan: [['south_asia', 100]], Bangladesh: [['south_asia', 100]], 'Sri Lanka': [['south_asia', 100]],
  Uzbekistan: [['caucasus', 50], ['ru', 50]],
  Australia: [['au', 74], ['yu', 8], ['it', 4], ['gr', 4], ['eAf', 5], ['wAf', 5]],
  'New Zealand': [['au', 86], ['en', 14]], 'New Caledonia': [['fr', 60], ['frCarib', 40]], Vanuatu: [['au', 100]],
}
