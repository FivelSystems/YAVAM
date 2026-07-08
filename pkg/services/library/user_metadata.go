package library

import "errors"

// errNoPersistence is returned when a user-metadata write is attempted without a
// database (tests / legacy callers). Ratings and favourites are the only genuinely
// new data YAVAM stores, so there is nowhere to put them without the DB.
var errNoPersistence = errors.New("user metadata: persistence unavailable")

// SetRating stores a 0–5 star rating for a package family, keyed version-agnostic
// in the user_metadata table. Clamping is handled by the DB layer.
func (s *defaultLibraryService) SetRating(family string, rating int) error {
	if s.db == nil {
		return errNoPersistence
	}
	return s.db.SetRating(family, rating)
}

// SetFavorite marks/unmarks a package family as a favourite in user_metadata.
func (s *defaultLibraryService) SetFavorite(family string, favorite bool) error {
	if s.db == nil {
		return errNoPersistence
	}
	return s.db.SetFavorite(family, favorite)
}
