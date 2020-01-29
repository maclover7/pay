const request = require('request-promise');
const cheerio = require('cheerio');
const xl = require('excel4node');

const [month, year] = process.argv[2].split('-');
const startDate = new Date(year, Number(month) - 1, 3);
const endDate = new Date(year, month, 0);

const processDesk = ({ categoryId, name }) => {
  return getPosts(categoryId)
    .then(mapPostsToWriters)
    .then(calculatePays)
    .then(savePays.bind(null, name))
    .then(() => {
      console.log(`Done - ${name}`);
      return Promise.resolve();
    });
};

const getPosts = (categoryId) => {
  return request({
    url: `https://pittnews.com/wp-json/wp/v2/posts?categories=${categoryId}&per_page=100`,
    json: true
  })
  .then((posts) => {
    const validPosts = posts.filter((post) => {
      const postDate = new Date(post.date);
      return postDate > startDate && postDate < endDate;
    });

    return Promise.resolve(validPosts);
  });
};

const mapPostsToWriters = (posts) => {
  const writers = {};

  posts.forEach((post) => {
    const $ = cheerio.load(`<div id="content">${post.content.rendered}</div>`);

    post.custom_fields.writer.forEach((writer) => {
      if (!writers[writer]) {
        writers[writer] = [];
      }

      var jobTitle = post.custom_fields.jobtitle && post.custom_fields.jobtitle[0];
      if (writer === 'News Editors') {
        jobTitle = '';
      }

      writers[writer].push({
        date: new Date(post.date).toLocaleDateString(),
        headline: post.title.rendered,
        characters: $('div#content').text().length - 1,
        jobTitle
      });
    });
  });

  return Promise.resolve(writers);
};

const writerJobTitles = {
  'Jon Moss': 'News Editor',
  'Lucy Li': 'For The Pitt News',
  'Rebecca Johnson': 'Senior Staff Writer',
  'Caroline Bourque': 'Managing Editor',
  'Elise Lavallee': 'Contributing Editor',
  'Janine Faust': 'Editor-in-chief',
  'Benjamin Nigrosh': 'Assistant News Editor',
  'Neena Hagen': 'Senior Staff Writer',
  'Emily Wolfe': 'Digital Manager',
};

const getPayRate = (writer, jobTitle) => {
  jobTitle = jobTitle.trim();

  if (['Staff Writer'].includes(jobTitle)) {
    return 0.0025;
  } else if (['Senior Staff Writers', 'Senior Staff Writer', 'Contributing Editor'].includes(jobTitle)) {
    return 0.0035;
  } else if (jobTitle === 'The Pitt News Staff') {
    if (!writerJobTitles[writer]) {
      throw new Error(`Need to define job title for writer: ${writer}`);
    } else {
      return getPayRate(writer, writerJobTitles[writer]);
    }
  } else {
    return 0;
  }

  throw new Error(`Unknown job title: ${jobTitle}`);
};

const calculatePays = (writers) => {
  Object.keys(writers).forEach((writer) => {
    writers[writer].forEach((post) => {
      const unroundedPay = post.characters * getPayRate(writer, post.jobTitle);
      post.pay = Math.round(100 * unroundedPay) / 100;
    });
  });

  return Promise.resolve(writers);
};

const savePays = (name, writers) => {
  const workbook = new xl.Workbook();

  Object.keys(writers).forEach((writer) => {
    const totalPay = writers[writer].reduce((total, post) => {
      return total + post.pay;
    }, 0);

    if (totalPay === 0) {
      return;
    }

    const worksheet = workbook.addWorksheet(writer);
    const style = workbook.createStyle({
      font: {
        color: 'black',
        size: 12,
      },
    });

    worksheet.column(1).setWidth(15);
    worksheet.column(2).setWidth(70);
    worksheet.column(3).setWidth(15);
    worksheet.column(4).setWidth(15);

    worksheet.cell(1, 1).string('News Pays').style(style);
    worksheet.cell(1, 2).string(writer).style(style);

    worksheet.cell(2, 1).string('Date').style(style);
    worksheet.cell(2, 2).string('Headline').style(style);
    worksheet.cell(2, 3).string('Characters').style(style);
    worksheet.cell(2, 4).string('Pay').style(style);

    var rowCounter = 3;
    writers[writer].forEach((post) => {
      const postRow = rowCounter++;
      worksheet.cell(postRow, 1).string(post.date).style(style);
      worksheet.cell(postRow, 2).string(post.headline).style(style);
      worksheet.cell(postRow, 3).number(post.characters).style(style);
      worksheet.cell(postRow, 4).number(post.pay).style(style);
    });

    worksheet.cell(rowCounter++, 4).number(totalPay).style(style);
  });

  const month = startDate.toLocaleString('en-us', { month: 'long' });
  workbook.write(`Pays-${month}-${name}.xlsx`);
};

const desks = [
  { categoryId: 31, name: 'News' },
  //{ categoryId: 52, name: 'Opinions' },
  //{ categoryId: 33, name: 'Culture' },
  //{ categoryId: 24, name: 'Sports' },
];

Promise.all(desks.map(processDesk))
  .then(() => console.log('All Done!'))
  .catch(console.log);
