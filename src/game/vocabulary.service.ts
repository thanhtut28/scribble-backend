import { Injectable } from '@nestjs/common';

@Injectable()
export class VocabularyService {
  private wordsByDifficulty = {
    easy: [
      'cat',
      'dog',
      'sun',
      'cup',
      'car',
      'hat',
      'bed',
      'pen',
      'key',
      'book',
      'fish',
      'ball',
      'tree',
      'door',
      'king',
      'moon',
      'star',
      'rain',
      'cake',
      'bird',
      'baby',
      'duck',
      'milk',
      'hand',
      'road',
      'lion',
      'bear',
      'frog',
      'gift',
      'nose',
      'shoe',
      'sock',
      'girl',
      'boy',
      'lamp',
      'boat',
      'kite',
      'rose',
      'mask',
      'frog',
      'nail',
      'ring',
      'coat',
      'ship',
      'flag',
      'chef',
      'goat',
      'pear',
      'wolf',
      'soap',
      'leaf',
      'desk',
      'bee',
      'egg',
      'eye',
      'arm',
      'jar',
      'ant',
      'fox',
      'owl',
      'pie',
      'pig',
      'bus',
      'van',
      'log',
      'web',
    ],
    medium: [
      'apple',
      'flower',
      'sunset',
      'guitar',
      'rabbit',
      'island',
      'banana',
      'dinner',
      'window',
      'castle',
      'dragon',
      'planet',
      'monkey',
      'pencil',
      'rocket',
      'teacher',
      'rainbow',
      'kitchen',
      'balloon',
      'chicken',
      'football',
      'mountain',
      'airplane',
      'computer',
      'elephant',
      'shoulder',
      'princess',
      'skeleton',
      'umbrella',
      'dinosaur',
      'hospital',
      'butterfly',
      'calendar',
      'necklace',
      'audience',
      'sunglasses',
      'chocolate',
      'alligator',
      'skateboard',
      'snowflake',
      'strawberry',
      'watermelon',
      'toothbrush',
      'hamburger',
      'binoculars',
      'snowboarding',
      'keyboard',
      'headphones',
      'playground',
      'butterfly',
      'crocodile',
      'furniture',
      'pineapple',
      'jellyfish',
      'kangaroo',
      'detective',
      'fireworks',
      'tornado',
      'octopus',
      'birthday',
      'treasure',
      'campfire',
      'baseball',
      'dolphin',
      'library',
    ],
    hard: [
      'constellation',
      'independence',
      'archaeology',
      'precipitation',
      'rollercoaster',
      'procrastinate',
      'thunderstorm',
      'invisibility',
      'extraterrestrial',
      'magnificence',
      'photosynthesis',
      'disappointment',
      'interpretation',
      'claustrophobia',
      'surveillance',
      'hieroglyphics',
      'skyscraper',
      'electricity',
      'kaleidoscope',
      'microphone',
      'astronaut',
      'fingerprint',
      'helicopter',
      'rhinoceros',
      'scorpion',
      'submarine',
      'chandelier',
      'escalator',
      'microscope',
      'octopus',
      'lighthouse',
      'caterpillar',
      'chameleon',
      'weightless',
      'trombone',
      'backflip',
      'quicksand',
      'explosion',
      'satellite',
      'sunburn',
      'revolution',
      'archaeology',
      'legislation',
      'achievement',
      'imagination',
      'equilibrium',
      'observatory',
      'philosophy',
      'technology',
      'silhouette',
      'democracy',
      'wilderness',
      'hypnotize',
      'masquerade',
      'enthusiasm',
      'generation',
      'camouflage',
      'celebration',
      'waterfall',
      'ambassador',
      'paradox',
    ],
  };

  /**
   * Get a random word from the vocabulary
   * @param difficulty The difficulty level ('easy', 'medium', 'hard')
   * @returns A random word from the specified difficulty level
   */
  getRandomWord(difficulty: 'easy' | 'medium' | 'hard' = 'medium'): string {
    const words = this.wordsByDifficulty[difficulty];
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
  }

  /**
   * Get multiple random words
   * @param count Number of words to get
   * @param difficulty The difficulty level
   * @returns Array of random words
   */
  getRandomWords(
    count: number,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  ): string[] {
    const words = [...this.wordsByDifficulty[difficulty]];
    const results: string[] = [];

    // Shuffle array and take first 'count' elements
    for (let i = 0; i < count && words.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      results.push(words[randomIndex]);
      words.splice(randomIndex, 1); // Remove the word to avoid duplicates
    }

    return results;
  }

  /**
   * Check if a guess matches a word
   * @param guess The user's guess
   * @param word The word to check against
   * @returns true if the guess is correct, false otherwise
   */
  isCorrectGuess(guess: string, word: string): boolean {
    return guess.toLowerCase().trim() === word.toLowerCase().trim();
  }
}
