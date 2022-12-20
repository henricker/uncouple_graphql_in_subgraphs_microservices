const { AuthenticationError, ForbiddenError } = require('@apollo/server');
const authErrMessage = '*** you must be logged in ***';

const resolvers = {
  Query: {
    searchListings: async (_, { criteria }, { dataSources }) => {
      const { numOfBeds, checkInDate, checkOutDate, page, limit, sortBy } = criteria;
      const listings = await dataSources.listingsAPI.getListings({ numOfBeds, page, limit, sortBy });

      // check availability for each listing
      const listingAvailability = await Promise.all(
        listings.map((listing) =>
          dataSources.bookingsDb.isListingAvailable({ listingId: listing.id, checkInDate, checkOutDate })
        )
      );

      // filter listings data based on availability
      const availableListings = listings.filter((listing, index) => listingAvailability[index]);

      return availableListings;
    },
    hostListings: async (_, __, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Host') {
        return dataSources.listingsAPI.getListingsForUser(userId);
      } else {
        throw new ForbiddenError('Only hosts have access to listings.');
      }
    },
    listing: (_, { id }, { dataSources }) => {
      return dataSources.listingsAPI.getListing(id);
    },
    featuredListings: (_, __, { dataSources }) => {
      const limit = 3;
      return dataSources.listingsAPI.getFeaturedListings(limit);
    },
    listingAmenities: (_, __, { dataSources }) => {
      return dataSources.listingsAPI.getAllAmenities();
    },
    guestBookings: async (_, __, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Guest') {
        const bookings = await dataSources.bookingsDb.getBookingsForUser(userId);
        return bookings;
      } else {
        throw new ForbiddenError('Only guests have access to trips');
      }
    },
    upcomingGuestBookings: async (_, __, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Guest') {
        const bookings = await dataSources.bookingsDb.getBookingsForUser(userId, 'UPCOMING');
        return bookings;
      } else {
        throw new ForbiddenError('Only guests have access to trips');
      }
    },
    pastGuestBookings: async (_, __, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Guest') {
        const bookings = await dataSources.bookingsDb.getBookingsForUser(userId, 'COMPLETED');
        return bookings;
      } else {
        throw new ForbiddenError('Only guests have access to trips');
      }
    },
    bookingsForListing: async (_, { listingId, status }, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Host') {
        // need to check if listing belongs to host
        const listings = await dataSources.listingsAPI.getListingsForUser(userId);
        if (listings.find((listing) => listing.id === listingId)) {
          const bookings = (await dataSources.bookingsDb.getBookingsForListing(listingId, status)) || [];
          return bookings;
        } else {
          throw new Error('Listing does not belong to host');
        }
      } else {
        throw new ForbiddenError('Only hosts have access to listing bookings');
      }
    },
  },
  Mutation: {
    createBooking: async (_, { createBookingInput }, { dataSources, userId }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      const { listingId, checkInDate, checkOutDate } = createBookingInput;
      const { totalCost } = await dataSources.listingsAPI.getTotalCost({ id: listingId, checkInDate, checkOutDate });

      try {
        await dataSources.paymentsAPI.subtractFunds({ userId, amount: totalCost });
      } catch (e) {
        return {
          code: 400,
          success: false,
          message: 'We couldn’t complete your request because your funds are insufficient.',
        };
      }

      try {
        const booking = await dataSources.bookingsDb.createBooking({
          listingId,
          checkInDate,
          checkOutDate,
          totalCost,
          guestId: userId,
        });

        return {
          code: 200,
          success: true,
          message: 'Successfully booked!',
          booking,
        };
      } catch (err) {
        return {
          code: 400,
          success: false,
          message: err.message,
        };
      }
    },
    createListing: async (_, { listing }, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      const { title, description, photoThumbnail, numOfBeds, costPerNight, locationType, amenities } = listing;

      if (userRole === 'Host') {
        try {
          const newListing = await dataSources.listingsAPI.createListing({
            title,
            description,
            photoThumbnail,
            numOfBeds,
            costPerNight,
            hostId: userId,
            locationType,
            amenities,
          });

          return {
            code: 200,
            success: true,
            message: 'Listing successfully created!',
            listing: newListing,
          };
        } catch (err) {
          return {
            code: 400,
            success: false,
            message: err.message,
          };
        }
      } else {
        return {
          code: 400,
          success: false,
          message: 'Only hosts can create new listings',
        };
      }
    },
    updateListing: async (_, { listingId, listing }, { dataSources, userId }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      try {
        const updatedListing = await dataSources.listingsAPI.updateListing({ listingId, listing });

        return {
          code: 200,
          success: true,
          message: 'Listing successfully updated!',
          listing: updatedListing,
        };
      } catch (err) {
        return {
          code: 400,
          success: false,
          message: err.message,
        };
      }
    },
    addFundsToWallet: async (_, { amount }, { dataSources, userId }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);
      try {
        const updatedWallet = await dataSources.paymentsAPI.addFunds({ userId, amount });
        return {
          code: 200,
          success: true,
          message: 'Successfully added funds to wallet',
          amount: updatedWallet.amount,
        };
      } catch (err) {
        return {
          code: 400,
          success: false,
          message: err.message,
        };
      }
    },
  },
  Host: {
    overallRating: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getOverallRatingForHost(id);
    },
  },
  Guest: {
    funds: async (_, __, { dataSources, userId }) => {
      const { amount } = await dataSources.paymentsAPI.getUserWalletAmount(userId);
      return amount;
    },
  },
  Listing: {
    host: ({ hostId }) => {
      return { id: hostId };
    },
    overallRating: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getOverallRatingForListing(id);
    },
    reviews: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getReviewsForListing(id);
    },
    totalCost: async ({ id }, { checkInDate, checkOutDate }, { dataSources }) => {
      const { totalCost } = await dataSources.listingsAPI.getTotalCost({ id, checkInDate, checkOutDate });
      return totalCost;
    },
    currentlyBookedDates: ({ id }, _, { dataSources }) => {
      return dataSources.bookingsDb.getCurrentlyBookedDateRangesForListing(id);
    },
    bookings: ({ id }, _, { dataSources }) => {
      return dataSources.bookingsDb.getBookingsForListing(id);
    },
    numberOfUpcomingBookings: async ({ id }, _, { dataSources }) => {
      const bookings = (await dataSources.bookingsDb.getBookingsForListing(id, 'UPCOMING')) || [];
      return bookings.length;
    },
  },
  Booking: {
    listing: ({ listingId }, _, { dataSources }) => {
      return dataSources.listingsAPI.getListing(listingId);
    },
    checkInDate: ({ checkInDate }, _, { dataSources }) => {
      return dataSources.bookingsDb.getHumanReadableDate(checkInDate);
    },
    checkOutDate: ({ checkOutDate }, _, { dataSources }) => {
      return dataSources.bookingsDb.getHumanReadableDate(checkOutDate);
    },
    guest: ({ guestId }) => {
      return { id: guestId };
    },
    totalPrice: async ({ listingId, checkInDate, checkOutDate }, _, { dataSources }) => {
      const { totalCost } = await dataSources.listingsAPI.getTotalCost({ id: listingId, checkInDate, checkOutDate });
      return totalCost;
    },
    guestReview: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getReviewForBooking('GUEST', id);
    },
    hostReview: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getReviewForBooking('HOST', id);
    },
    locationReview: ({ id }, _, { dataSources }) => {
      return dataSources.reviewsDb.getReviewForBooking('LISTING', id);
    },
  },
  AmenityCategory: {
    ACCOMMODATION_DETAILS: 'Accommodation Details',
    SPACE_SURVIVAL: 'Space Survival',
    OUTDOORS: 'Outdoors',
  },
};

module.exports = resolvers;